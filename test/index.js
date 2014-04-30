/**
 * Created by dob on 14.04.14.
 */
var assert = require('assert'),
  mongo = require('mongodb'),
  mongoose = require('mongoose'),
  Grid = require('../'),
  should = require('should'),
  crypto = require('crypto'),
  fs = require('fs'),
  txtReadPath = __dirname + '/testfiles/1.txt',
  testBin = __dirname + '/testfiles/binary.bin',
  outputPath =  __dirname + '/testfiles/output.txt',
  pdfFile = __dirname + '/testfiles/test.pdf',
  pngFile = __dirname + '/testfiles/test.png',
  jpgFile = __dirname + '/testfiles/test.jpg',
  pngFileDe = __dirname + '/testfiles/test_de.png',
  server,
  db;


describe('gfsuploader', function(){
  var id, filesize, txtId;

  before(function (done) {
    var wstream = fs.createWriteStream(testBin);
    // creates random Buffer of 20 MegaBytes
    var buffer = crypto.randomBytes(20971520);
    wstream.write(buffer);
    wstream.end();
    server = new mongo.Server('localhost', 27017);
    db = new mongo.Db('gridloader_test', server, {w:1});
    db.open(done)
  });

  describe('Grid', function () {
    it('should be a function', function () {
      assert('function' == typeof Grid);
    });
  });

  describe('GridWrite', function(){
    var g;

    before(function(){
      g =new Grid(mongo);
      g.db = db;
    });

    it('should be a object', function () {
      assert('object' == typeof g);
    });

    it('should put a unique file', function(done) {
      g.putUniqueFile(txtReadPath, 'text.txt', null, function(err, result) {
        txtId = result._id;
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        done();
      })
    });

    it('should fail to put the file again', function(done) {
      g.putUniqueFile(txtReadPath, 'text.txt', null, function(err, result) {
        err.should.be.an.Error;
        should.not.exist(result);
        done();
      })
    });

    it('should put a huge  file', function(done) {
      g.putFile(testBin, 'test.bin', null, function(err, result) {
        id = result._id;
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        done();
      })
    });
  });

  describe('GridRead', function() {
    var g;

    before(function(){
      g =new Grid(mongo);
      g.db = db;
    });

    it('should be a object', function () {
      assert('object' == typeof g);
    });

    it('should return same filesize', function(done) {
      g.get(id, function(err, fileData) {
        var fileSize = fs.statSync(testBin).size;
        assert.equal(fileSize, fileData.length);
        done();
      });
    });

    it('should return same data', function(done) {
      var output = fs.createWriteStream(outputPath, {'flags': 'w'});
      g.getFileStream(id, function(err, filestream) {
        if(filestream) {
          filestream.pipe(output);
          filestream.on('error', function (err) {
            throw err;
            done();
          });
          filestream.on('end', function (file) {
            var original = fs.readFileSync(testBin);
            fs.readFile(outputPath, function(err, file) {
              assert.equal(original.toString('base64'), file.toString('base64'));
              done();
            });
          });
        } else {
          throw err;
          done();
        }
      })
    });
  });


  describe('MongooseRead', function() {
    var mongoose, model;

    before(function(){
      var mongoose = require('mongoose');
      mongoose.connect('mongodb://localhost/gridloader_test');
      var schema = new mongoose.Schema({
        filename: String
      },{safe: false, collection: 'fs.files'});
      model = mongoose.model('files', schema);
    });

    it('should return data via mongoose', function(done) {
      model.findById(id, function(err, docs) {
        should.not.exist(err);
        docs.should.be.an.Object;
        done();
      });
    });
  });

  describe('GridDelete', function() {
    var g;

    before(function(){
      g =new Grid(mongo);
      g.db = db;
    });

    it('should return true when deleted successfully', function(done) {
      g.deleteFile(id, null, function(err, status) {
        should.not.exist(err);
        status.should.be.ok;
        done();
      });
    });
  });

  describe('Textract', function() {
    var g;

    before(function(){
      g =new Grid(mongo);
      g.db = db;
    });

    it('should be a object', function () {
      assert('object' == typeof g);
    });

    it('should index a PDF file', function(done) {
      g.putFile(pdfFile, 'test.pdf', null, function(err, result) {
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        should.exist(result.metadata.text);
        done();
      })
    });

    it('should index a Image file', function(done) {
      // indexing a png takes usually longer
      this.timeout(50000);
      g.putFile(pngFile, 'test.png', null, function(err, result) {
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        should.exist(result.metadata.text);
        done();
      })
    });

    it('should index a german Image file', function(done) {
      // indexing a png takes usually longer
      // lacks current support of textract library for defining multiple language versions
      this.timeout(50000);
      g.putFile(pngFileDe, 'test_de.png', null, function(err, result) {
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        should.exist(result.metadata.text);
        done();
      })
    });

    it('should put a jpeg with exif-data', function(done) {
      // indexing a png takes usually longer
      // lacks current support of textract library for defining multiple language versions
      g.putFile(jpgFile, 'test.jpg', null, function(err, result) {
        should.not.exist(err);
        should.exist(result);
        result.should.be.an.Object;
        should.exist(result.metadata.image);
        should.exist(result.metadata.exif);
        done();
      })
    });
  });



  after(function (done) {
    fs.unlinkSync(testBin);
    fs.unlinkSync(outputPath);
    db.dropDatabase(function () {
      db.close(true, done);
    });
  });
});