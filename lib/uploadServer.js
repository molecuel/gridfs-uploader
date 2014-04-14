/*
 *
 * This class creates an import server for unique CSV - files into the mongodb gridfs.
 * It's tested with mongoose as database abstraction layer
 * 
 * Features:
 * - User authentication via client SSL certificate
 * - User authentication callback function
 * - Adding custom routes
 * - Adding types of import
 * - Setting port an IP'addresses to listen on
 * 
 */

var express = require('express'),
  fs = require('fs'),
  https = require('https'),
  events = require('events');

// Version
this.version = [0, 0, 1];

/**
 * Custom error objects
 *
 * @this {GFSMissingFileError}
 * @constructor
 */
function GFSMissingFileError() {
  this.name = 'MissingFile';
  this.message = 'File is missing';
};
GFSMissingFileError.prototype = new Error();
GFSMissingFileError.prototype.constructor = GFSMissingFileError;


/**
 * Custom error for unauthorized user
 *
 * @this {GFSUserUnauthorized}
 * @constructor
 */
function GFSUserUnauthorized() {
  this.name = 'UserUnauthorized';
  this.message = 'User is not authorized';
};
GFSUserUnauthorized.prototype = new Error();
GFSUserUnauthorized.prototype.constructor = GFSUserUnauthorized;

/**
 * Constructor for the module class
 *
 * @this {GFSuploadServer}
 *
 * @constructor
 * @param {Object} mongoose The mongoose object from your application
 * @param {Integer} port The port of the server instance
 * @param {Array} ssloptions Options like certificate etc for the SSL express server instance
 * @param {Array} routes Array of objects for routing information { url: '/import/incidents', prefix: 'import', type: 'incidents'}
 * @param {Array} listen IP addresses to listen on
 * @param {Function} defaultcallback Default function for callback
 * @param {Function} authcallback Callback function to implement custom authentication functions
 *
 */
function GFSuploadServer(mongoose, port, ssloptions, routes, listen, defaultcallback, authcallback) {
  this.port = port;
  this.ssloptions = ssloptions;
  this.routes = routes;
  this.listen = listen;
  this.authcallback = authcallback;
  this.mongoose = mongoose;
  if(defaultcallback) {
    this.defaultcallback = defaultcallback;
  } else {
    this.defaultcallback = function(err, result, type, user) {

    }
  }
  this.registerServer(routes);
  return this;
}

/**
 * Add event emitter
 *
 * @this {GFSuploadServer}
 */
GFSuploadServer.prototype = new events.EventEmitter;

/**
 * Registers custom express server instances on specified ports and
 * adds the routing to the server
 *
 * @this {GFSuploadServer}
 *
 * @param {Array} routes The routes for the server
 *
 */
GFSuploadServer.prototype.registerServer = function(routes) {
  var application = express();
  application.use(express.bodyParser());
  application.use(express.compress());
  var self = this;
  // register POST URL's
  routes.forEach(function(item) {
    application.post(item.url, self.returnHandlerFunction(item.prefix, item.type));
  });
  // listen server
  if(self.ssloptions && self.ssloptions.cert) {
    this.listen.forEach(function(item) {
      https.createServer(self.ssloptions, application).listen(self.port, item, function() {
        console.log("Import server listening on ip %s on port %d in %s mode - IP family: %s", this.address().address, this.address().port, application.settings.env, this.address().family);
      });
    });
  } else {
    this.listen.forEach(function(item) {
      var http = require('http');
      http.createServer(application).listen(self.port, item, function() {
        console.warn("WARNING!!! Insecure import server started");
        console.log("Import server listening on ip %s on port %d in %s mode - IP family: %s", this.address().address, this.address().port, application.settings.env, this.address().family);
      });
    });
  }

}

/**
 * Returns the handler, handles the errors and the authentication
 *
 * @this {GFSuploadServer}
 *
 * @param {String} prefix The prefix for the mongodb database
 * @param {String} type A custom type like incidents for the file
 *
 * @return Function
 */
GFSuploadServer.prototype.returnHandlerFunction = function(prefix, type) {
  var self = this;
  var myhandler = function(req, res) {
    console.log(req.connection.getPeerCertificate());
    // check if SSL client cert authentication is enabled
    if ((self.ssloptions.requestCert &&  req.client.authorized) || !self.ssloptions.requestCert) {
      if(typeof self.authcallback =='undefined') {
        self.handlerFunction(req, res, prefix, type);
      } else if(self.authcallback) {
        // calls the authentication callback from the implementation
        self.authcallback(req,res,function(err, result) {
          if(result) {
            req.currentuser = result;
            self.handlerFunction(req, res, prefix, type);
          } else {
            self.emit('error', new GFSUserUnauthorized());
            res.send(401);
          }
        });
      } else {
        self.emit('error',new GFSMissingFileError());
        res.send(415);
      }
    } else {
      self.emit('error', new GFSUserUnauthorized());
      res.send(401);
    }
  };
  return myhandler;
}


/**
 * Returns the handler for the route
 *
 * @this {GFSuploadServer}
 *
 * @param {Object} req The request object
 * @param {Object} res The response object
 * @param {String} prefix The prefix for the gridfs
 * @param {String} type The type of the import
 *
 */
GFSuploadServer.prototype.handlerFunction = function(req, res, prefix, type) {
  var self = this;
  var gfs = require('gridfs-upload');
  var grid = new gfs(self.mongoose, prefix);
  grid.importCSVFiles(
    req.files.file[0],
    true,
    function(err, result) {
      var resultobject = {
        file: result,
        type: type,
        user: req.currentuser
      }
      if(err) {
        self.emit('error', err);
        res.send(500, err);
      } else {
        self.defaultcallback(null, resultobject, function(cberr) {
          var fileid = result._id;
          if(!fileid) {
            fileid = result.fileId;
          }
          if(cberr) {
            // delete the file if an error occurs on the default callback
            grid.deleteFile(fileid, null, function(err, result) {
              if(err) {
                self.emit('error', err);
              }
            });
            res.send(500, err);
          } else {
            delete(result.db);
            delete(result.currentChunk);
            res.send(200, result);
          }
        });
      }
    });
};

// Export Main Class
module.exports = GFSuploadServer;