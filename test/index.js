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
        txtId = result.fileId;
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
        id = result.fileId;
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
      var filestream = g.getFileStream(id);
      filestream.pipe(output);
      filestream.on('error', function (err) {
        throw err;
      });
      filestream.on('end', function (file) {
        var original = fs.readFileSync(testBin);
        var newfile = fs.readFile(outputPath, function(err, file) {
          assert.equal(original.toString('base64'), file.toString('base64'));
          done();
        });
      });
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

  after(function (done) {
    fs.unlinkSync(testBin);
    fs.unlinkSync(outputPath);
    db.dropDatabase(function () {
      db.close(true, done);
    });

  });
});