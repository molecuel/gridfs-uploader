/**
 * This class enables gridfs uploads for all the mongoose users
 *
 * Features:
 * - Get files from gridfs
 * - Put files to gridfs
 * - Put unique files to gridfs ( check if already exists with a md5 file hash )
 * - Delete file from gridfs
 * - Checksum creation of file with sha and md5
 * - CSV File import ( checks if CSV file )
 *
 */
this.version = [0, 0, 1];

var async = require('async'),
  path = require('path'),
  mime = require('mime'),
  mmm = require('mmmagic'),
  Magic = mmm.Magic,
  crypto = require('crypto'),
  fs = require('fs'),
  textract = require('textract'),
  _ = require('underscore'),
  gridfsStream = require('gridfs-stream'),
  ExifImage = require('exif').ExifImage;


/**
 *  Custom error object for duplicated file
 *
 *  @this {GFSUniqueError}
 */
function GFSUniqueError(path, result) {
  this.name = 'NotUnique';
  this.message = 'File already in gridfs';
  this.path = path;
  this.result = result;
};
GFSUniqueError.prototype = new Error();
GFSUniqueError.prototype.constructor = GFSUniqueError;

/**
 *  Custom error object for wrong file type
 *
 *  @this {GFSFileTypeError}
 */
function GFSFileTypeError(path, name) {
  this.name = 'NotValid';
  this.message = 'File has wrong file type';
  this.path = path;
  this.filename = name;
};
GFSFileTypeError.prototype = new Error();
GFSFileTypeError.prototype.constructor = GFSFileTypeError;

/**
 * This class enables gridfs uploads for all the mongoose users
 *
 *  @constructor
 *  @param {Object} mongoose Mongoose Object from you application
 *  @param {String} prefix Prefix for the database like "imports"
 *  @author "Dominic Böttger" <Dominic.Boettger@inspirationlabs.com>
 *
 *  @return {Object}
 */
function GFSupload(mongoinst, prefix) {
  this.mongo = mongoinst;
  this.db = this.mongo.db;
  this.Grid = this.mongo.Grid;
  this.GridStore = this.mongo.GridStore;
  this.ObjectID = this.mongo.ObjectID;
  this.prefix = prefix || this.GridStore.DEFAULT_ROOT_COLLECTION;
  return this;
}

GFSupload.prototype.getStream = function() {
  if(!this.gfsStream) {
    if(this.db && this.mongo) {
      /** gfs stream init **/
      this.gfsStream = gridfsStream(this.db, this.mongo);
      this.gfsStream.collection(this.prefix);
      return this.gfsStream;
    } else {
      return null;
    }
  } else {
    return this.gfsStream;
  }
}

/**
 * Get File from gridfs
 *
 * @param String id ID of file in database
 * @param Function fn Callback function
 * @deprecated in favor of gridfs-stream
 */
GFSupload.prototype.get = function(id, fn) {
  var self = this;
  var db, store;
  db = this.db;
  id = new self.ObjectID(id);
  store = new self.GridStore(db, id, "r", {
    root: this.prefix
  });
  return store.open(function(err, store) {
    if (err) {
      return fn(err);
    }
    if (("" + store.filename) === ("" + store.fileId) && store.metadata && store.metadata.filename) {
      store.filename = store.metadata.filename;
    }
    return fn(null, store);
  });
};

/**
 * Gets the file stream from gridfs
 *
 * @param id
 * @returns {Stream}
 */
GFSupload.prototype.getFileStream = function(id, callback) {
  var self = this;
  this.db.collection(this.prefix+'.files', function (err, collection) {
    var verifiedId;
    if(typeof id == 'string') {
      verifiedId = new self.mongo.ObjectID(id);
    } else if(id instanceof self.mongo.ObjectID) {
      verifiedId = id;
    }

    if(verifiedId) {
      collection.findOne({_id: verifiedId}, function(err, results) {
        if(results) {
          callback(err, self.getStream().createReadStream({_id: id}));
        } else {
          callback(err);
        }
      });
    }
  });
}

/**
 * Puts a unique file in gridfs
 * executes putFile after checking the hashs
 *
 * @this {GFSupload}
 *
 * @param {String} path
 * @param {String} name
 * @param {Object} options
 * @param {Function} callback
 */
GFSupload.prototype.putUniqueFile = function(path, name, options, callback) {
  if(!options) {
    options = {};
  }
  var self = this;
  this.md5(path, function(err, hash) {
    if(err) {
      callback(err);
    } else {
      options.md5 = hash;
      self.findByMd5(hash, function(err, result) {
        if(!result) {
          self.putFile(path, name, options, callback);
        } else {
          callback(new GFSUniqueError(path, result));
        }
      });
    }
  });
}

/**
 * Puts a file in gridfs and checks the mime type with mime magic
 * executes __putFile after getting the content type
 *
 * @this {GFSupload}
 *
 * @param {String} path
 * @param {String} name
 * @param {Object} options
 * @param {Function} callback
 */
GFSupload.prototype.putFile = function(path, name, options, callback) {
  if(!options) {
    options = {};
  }

  var self = this;
  if(!options.content_type) {
    var magic = new Magic(mmm.MAGIC_MIME_TYPE);
    magic.detectFile(path, function(err, type) {
      if(err) {
        callback(err);
      } else {
        options.content_type = type;
        self._putFile(path, name, options, callback);
      }
    });
  } else {
    self._putFile(path, name, options, callback);
  }
};

/**
 * Opens the gridstore and puts the file into the database
 *
 * @this {GFSupload}
 *
 * @param {String} path
 * @param {String} name
 * @param {Object} options
 * @param {Function} fn Callback function
 */
GFSupload.prototype._putFile = function(path, name, options, fn) {
  var db;
  var self = this;
  db = this.db;
  options = this.parse(options);
  options.metadata.filename = name;
  options.metadata.content_type = options.content_type;
  options.root = this.prefix;

  var extractOptions = {};

  if(options.lang) {
    extractOptions.images = {};
    extractOptions.images.exec = '-l '+options.lang;
  }

  var fileId = new self.ObjectID();

  var readFunction = function readFunction(id, cb) {
    self.db.collection(self.prefix+'.files', function (err, collection) {
      if(err) return cb(err);
      collection.findOne({_id: id}, function(err, result) {
        return cb(err, result);
      });
    });
  }

  var storeFunction = function storeFunction(options) {
    return self.GridStore(db, fileId, name, 'w', options).open(function(err, file) {
      if (err) {
        return fn(err);
      }
      //console.log(file);
      if(options.md5) {
        self.findByMd5(options.md5, function(err, result) {
          if(!err && !result) {
            return file.writeFile(path, function(err, writeRes) {
              if(err) return fn(err);
              readFunction(writeRes.fileId, fn);
            });
          } else {
            readFunction(result._id, fn);
          }
        });
      } else {
        return file.writeFile(path, function(err, writeRes) {
          if(err) return fn(err);
          readFunction(writeRes.fileId, fn);
        });
      }
    });
  }

  if(options.hasOwnProperty('textract') && options.textract === false) {
    delete (options.textract);
    return storeFunction(options);
  } else {
    return textract(options.content_type, path, extractOptions, function( error, text ) {
      options.metadata.text = text;
      if(options.content_type == 'image/jpeg') {

        try {
          new ExifImage({ image : path.jpg }, function (exifError, exifData) {
            if (exifError) {
              console.log('Error: '+error.message);
            } else {
              if(exifData) {
                _.extend(options.metadata, exifData);
              }
            }
          });
        } catch (error) {
          return storeFunction(options);
        }
      } else {
        return storeFunction(options);
      }
    });
  }

};

/**
 * Delete file from the database
 *
 * @this {GFSupload}
 *
 * @param {String} id The ObjectId of the file
 * @param {Object} options
 * @param {Function} callback Callback function after deleting the file
 */
GFSupload.prototype.deleteFile = function(id, options, callback) {

  var args = [];
  for (var i = 0; i < arguments.length; i++) {
    args.push(arguments[i]);
  }

  id = args.shift();
  callback = args.pop();

  // optional argument
  if (args.length > 0) options = args.shift(); else options = null;

  var verifiedId;
  if(typeof id == 'string') {
    verifiedId = new this.mongo.ObjectID(id);
  } else if(id instanceof this.mongo.ObjectID) {
    verifiedId = id;
  } else {
    return callback(new Error('No File ID specified'));
  }
  var self = this;
  var db;
  db = this.db;
  if(!options) {
    options = {};
  }
  options.root = this.prefix;
  return new self.GridStore(db, verifiedId, 'r', options).open(function(err, file) {
    if(err) {
      return callback(err, false);
    } else {
      return file.unlink(function(err, result) {
        if(err) return callback(err, false);
        return callback(null, true);
      });
    }
  });
};

/**
 * Parses the options and sets empty Objects
 *
 * @this {GFSupload}
 *
 * @param {Object} options
 */
GFSupload.prototype.parse = function(options) {
  if(!options) {
    options = {};
  }
  if (!options.metadata) {
    options.metadata = {};
  }
  return options;
};

/**
 * Creates an md5 hash of the file
 *
 * @this {GFSupload}
 *
 * @param {String} filepath Path of for hash creation
 * @param {Function} callback Callback function
 */
GFSupload.prototype.md5 = function(filepath, callback) {
  var hash = crypto.createHash('md5');
  var s = fs.ReadStream(filepath);
  s.on('data', function(d) {
    hash.update(d);
  });

  s.on('end', function() {
    var d = hash.digest('hex');
    callback(null, d);
  });

  s.on('error', function(err) {
     callback(err);
  });
};

/**
 * Creates an sha1 hash of the file
 *
 * @this {GFSupload}
 *
 * @param {String} filepath Path of for hash creation
 * @param {Function} callback Callback function
 */
GFSupload.prototype.sha1 = function(filepath, callback) {
  var hash = crypto.createHash('sha1');
  var s = fs.ReadStream(filepath);
  s.on('data', function(d) {
    hash.update(d);
  });

  s.on('end', function() {
    var d = hash.digest('hex');
    callback(null, d);
  });

  s.on('error', function(err) {
    callback(err);
  });
};

/**
 * Creates an sha256 hash of the file
 *
 * @this {GFSupload}
 *
 * @param {String} filepath Path of for hash creation
 * @param {Function} callback Callback function
 */
GFSupload.prototype.sha256 = function(filepath, callback) {
  var hash = crypto.createHash('sha256');
  var s = fs.ReadStream(filepath);
  s.on('data', function(d) {
    hash.update(d);
  });

  s.on('end', function() {
    var d = hash.digest('hex');
    callback(null, d);
  });

  s.on('error', function(err) {
    callback(err);
  });
};

/**
 * Finds a file by md5 hash
 *
 * @this {GFSupload}
 *
 * @param {String} md5 File md5 to search for
 * @param {Function} callback Callback function
 */
GFSupload.prototype.findByMd5 = function(md5, callback) {
  this.db.collection(this.prefix+'.files', function (err, collection) {
    collection.findOne({md5: md5}, function(err, results) {
      callback(err, results);
    });
  });
}

/**
 * Import CSV file to database
 *
 * @this {GFSupload}
 *
 * @param {Array} files Array or filestring to upload
 * @param {Boolean} unique Should the file be unique in the database
 * @param {Function} callback Callback function
 */
GFSupload.prototype.importCSVFiles = function(files, unique, callback) {
  var results = [];
  var errors = [];
  var self = this;
  var parseFiles = function(filepath, cb) {
    var file = filepath;
    if(typeof filepath == 'string') {
      file = {};
      file.path = filepath;
      file.dir = path.dirname(filepath);
      file.name = path.basename(filepath);
    }
    self.checkCSV(file, function(err, iscsv) {
      if(err || !iscsv) {
        errors.push(new GFSFileTypeError(file.path, file.name));
        results.push(new GFSFileTypeError(file.path, file.name));
        cb(null, results);
      } else {
        var options = {};
        options = self.parse(options);
        options.metadata.mime = 'text/csv';
        if(!unique) {
          self.putFile(file.path, file.name, options, function(err, result) {
            if(err) {
              errors.push(err);
              results.push(err);
            } else {
              results.push(result);
            }
            cb(null, results);
          });
        } else {
          self.putUniqueFile(file.path, file.name, options, function(err, result) {
            if(err) {
              errors.push(err);
              results.push(err);
            } else {
              results.push(result);
            }
            cb(null, results);
          });
        }
      }
    });
  };
  if(files) {
    /**
     * check if it's an array with multiple entries
     */
    if( Object.prototype.toString.call( files ) === '[object Array]' && files.length > 1) {
      async.forEach(files, parseFiles, function(err) {
        if(errors.length > 0) {
          callback(errors, results);
        } else {
          callback(err, results);
        }
      });
      /*
       * check if it's an array with only one entry
       */
    } else if(Object.prototype.toString.call( files ) === '[object Array]' && files.length == 1) {
      parseFiles(files[0], function(err, result) {
        if(errors.length > 0) {
          callback(errors[0], null);
        } else {
          callback(err, results[0]);
        }
      });
    } else {
      /*
       * else (string)
       */
      parseFiles(files, function(err, result) {
        if(errors.length > 0) {
          callback(errors[0], null);
        } else {
          callback(err, results[0]);
        }
      });;
    }
  }
};

/**
 * Checks if it's a CSV file
 *
 * @this {GFSupload}
 *
 * @param {Object} file File object
 * @param {Function} callback Callback function
 */
GFSupload.prototype.checkCSV = function(file, callback) {
  var magic = new Magic(mmm.MAGIC_MIME_TYPE);
  magic.detectFile(file.path, function(err, type) {
    if(err) {
      callback(err);
    } else {
      if(type == 'text/plain') {
        var mtype = mime.lookup(file.name);
        if(mtype == 'text/csv') {
          callback(null, true);
        } else {
          callback(null, false);
        }
      } else {
        callback(null, false);
      }
    }
  });
};

// Export Main Class
module.exports = GFSupload;
