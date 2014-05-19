#!/usr/bin/env node

var fs = require('fs');
var zlib = require('zlib');

var rem = require('rem');
var skim = require('skim');
var tar = require('tar');
var concat = require('concat-stream')
var async = require('async');

var colonyCompiler = require('../');

// require('look').start();

var client = new rem.Client();
// client.debug = true

function getDepended (page, next) {
  client.stream('https://www.npmjs.org/', 'browse/depended', page).get().pipe(skim({
    'rows': {
      '$query': '.row',
      '$each': '(text) a'
    }
  }, function (data) {
    next(null, data.rows);
  }))
}

function withTarball (name, stream, next) {
  var entries = [];
  stream
    .pipe(zlib.createGunzip())
    .pipe(new tar.Parse()).on('entry', function (entry) {
      if (entry.path.match(/\.js$/i)) {
        entry.pipe(concat(function (data) {
          entries.push({
            name: name,
            path: entry.path,
            source: String(data)
          });
        }));
      }
    })
    .on('end', function () {
      // run 

      colonyCompiler.all(entries, function (err, compiled, entry, next) {
        if (err) {
          console.log('BYECODE ERROR:', name, entry.path, err);
          return next();
        }

        // console.log(entry.path);
        entry.compiled = compiled;
        next(null, entry);
      }, next);
    })
    .on('error', function (err) {
      console.error(err);
      next(err);
    })
}

function getTarball (name, next) {
  client.debug && console.log('downloading', name, '...')
  client.json('http://registry.npmjs.org/', name, 'latest').get(function (err, json) {
    client.debug && console.log(json && json.dist.tarball);
    withTarball(name, client.stream(json.dist.tarball).get(), next);
  })
}

getDepended(0, function (err, modules) {
  var i = 0;
  async.eachSeries(modules || [], function (m, next) {
    console.log('#', ++i, m);
    getTarball(m, next);
  }, function (err) {
    if (err) {
      throw err;
    }
    console.log('done');
  });
});
