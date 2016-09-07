/* jshint esversion: 6 */
/*
Turn xx sources into something that you can put into a javascript file in
the browser (e.g. index.js).
*/
const xx = require('./xx');
const fs = require('fs');

function readAll(paths, cb) {
  const result = [], errors = [];
  let len = paths.length;
  paths.forEach((path, k) => {
    fs.readFile(path, 'utf8', (err, data) => {
      len--;
      if (err) {
        throw err;
      } else {
        result[k] = [path, data];
      }
      if (len === 0) {
        cb(result);
      }
    });
  });
}

const NATIVE_DOM_MODULE = `

`;

const DOM_MODULE = `
package xx.lib.dom;
`;

function main() {
  const inputs = process.argv.slice(2);
  readAll(inputs, (result) => {
    const cg = new xx.CodeGenerator();
    cg.addNativeModule("xx.lib.dom (native)", NATIVE_DOM_MODULE);
    cg.addModule("xx.lib.dom", DOM_MODULE);
    for (const [path, data] of result) {
      cg.addModule(path, data);
    }
    cg.process();
    console.log(cg.compile());
  });
}

if (require.main === module) {
  main();
}
