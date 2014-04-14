# gridfs-uploader

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
var filestream = g.getFileStream(id);
filestream.pipe(output);

```

## Todo
- Some tests are missing ( check for CSV for example )
- Adding additional handler for file types.

## Using unit test

Use "npm test" or the command "make test"