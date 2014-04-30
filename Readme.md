[![Build Status](https://travis-ci.org/DominicBoettger/gridfs-uploader.svg?branch=master)](https://travis-ci.org/DominicBoettger/gridfs-uploader)

[![NPM](https://nodei.co/npm-dl/gridfs-uploader.png?months=1)](https://nodei.co/npm/gridfs-uploader/)

[![NPM](https://nodei.co/npm/gridfs-uploader.png?downloads=true&stars=true)](https://nodei.co/npm/gridfs-uploader/)

[![NPM version](https://badge.fury.io/js/gridfs-uploader@2x.png)](http://badge.fury.io/js/gridfs-uploader)


CAUTION!!!! getFileStream syntax change to be able to check the existence of the file before!!!!

# gridfs-uploader + fulltext extraction

Easily add new files to mongos gridfs. Special feature is to check for uniqueness while uploading the file.
Returns an error with the file duplicate from the database.

```js
var mongo = require('mongodb');
var Grid = require('gridfs-uploader');

var server = new mongo.Server('localhost', 27017);
var db = new mongo.Db('gridloader_test', server, {w:1});

var g =new Grid(mongo);
g.db = db;

// write a unique file to gridfs
g.putUniqueFile('/mypath/test.txt', 'text.txt', null, function(err, result) {
 console.log(result);
});


// read Stream from gridfs (provided by gridfs-stream)
var output = fs.createWriteStream(outputPath, {'flags': 'w'});
g.getFileStream(id, function(err, filestream) {
  filestream.pipe(output);
}
```

## Text extraction of files

gridfs-uploader uses textract to automatically get texts from uploaded files and stores it as additional metadata in the files collection.

* PDF
* DOC
* DOCX
* XLS
* XLSX
* XLSB
* XLSM
* PPTX
* DXF
* PNG
* JPG
* GIF
* RTF
* application/javascript
* All text/* mime-types

To use this feature you should install the needed system libraries.

Install libraries under ubuntu
> apt-get install catdoc poppler-utils tesseract-ocr unzip


## Exif extraction for JPEG - files

Starting with version 0.6.0 every uploaded jpeg will be scanned for exif - data.

For example a result in the metadata of the files object can be

```js
{ filename: 'test.jpg',
  content_type: 'image/jpeg',
  text: ' ',
  image:
   { Make: 'NIKON CORPORATION',
     Model: 'NIKON D3000',
     XResolution: 300,
     YResolution: 300,
     ResolutionUnit: 2,
     Software: 'Ver.1.00 ',
     ModifyDate: '2013:10:17 15:42:37',
     ExifOffset: 198,
     GPSInfo: 776 },
  ...
```

## Read data with mongoose

```js
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/gridloader_test');
var schema = new mongoose.Schema({
    filename: String
},{safe: false, collection: 'fs.files'});
var model = mongoose.model('files', schema);
model.findById(id, function(err, docs) {
	console.log(docs);
}
```

## Todo
- Some tests are missing ( check for CSV for example )
- Adding additional handler for file types.

## Using unit test

Use "npm test" or the command "make test"