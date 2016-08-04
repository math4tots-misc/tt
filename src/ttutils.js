// jshint esversion: 6

const xxutils = Object.create(null);
(function(exports) {
"use strict";

function asyncf(generator) {
  return function() {
    const generatorObject = generator.apply(this, arguments);
    return new Promise((resolve, reject) => {
      asyncfHelper(generatorObject, resolve, reject);
    });
  };
}

function asyncfHelper(generatorObject, resolve, reject, val, thr) {
  const {value, done} =
      thr ? generatorObject.throw(val) : generatorObject.next(val);
  if (done) {
    resolve(value);
  } else {
    value.then(result => {
      // NOTE: Any exceptions thrown here will be passed to
      // the handler in the catch clause below
      asyncfHelper(generatorObject, resolve, reject, result);
    }).catch(reason => {
      try {
        asyncfHelper(generatorObject, resolve, reject, reason, true);
      } catch (e) {
        // TODO: Unfortunately, the exception 'e' doesn't really contain
        // much helpful stack data... So at the very least we get a
        // message, but we still don't see where
        console.error(e);
        throw e;
      }
    });
  }
}

function asyncReadFile(path) {
  // NOTE: I don't want require here to be picked up by browserify
  const req = require;

  return new Promise((resolve, reject) => {
    const fs = req("fs");
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString());
      }
    });
  });
}

function asyncDir(path) {
  // NOTE: I don't want require here to be picked up by browserify
  const req = require;

  return new Promise((resolve, reject) => {
    const fs = req("fs");
    fs.readdir(path, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}

function sanitizeString(str) {
  let r = "";
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\") {
      i++;
      switch(str[i]) {
      case "\\": r += "\\"; break;
      case "\"": r += "\""; break;
      case "\'": r += "\'"; break;
      case "\n": r += "\n"; break;
      case "\r": r += "\r"; break;
      case "\t": r += "\t"; break;
      default: throw new Error("Invalid string escape: " + str[i]);
      }
    } else {
      r += str[i];
    }
    i++;
  }
  return r;
}

exports.asyncf = asyncf;
exports.asyncReadFile = asyncReadFile;
exports.asyncDir = asyncDir;
exports.sanitizeString = sanitizeString;

})(xxutils);

module.exports = xxutils;
