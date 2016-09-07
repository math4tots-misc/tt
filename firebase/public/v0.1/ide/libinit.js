/* jshint esversion: 6 */

// Initializes the object that all libraries will add to instead of
// writing to global.
// Also fills it with some useful async stuff.

const lib = Object.create(null);

(function(exports) {
"use strict";

// Makeshift async/await
function asyncf(generator) {
  return function() {
    const generatorObject = generator.apply(this, arguments);
    return new Promise((resolve, reject) => {
      _asyncfHelper(generatorObject, resolve, reject);
    });
  };
}

function _asyncfHelper(generatorObject, resolve, reject, result, throwNext) {
  let value, done;
  try {
    const pair = throwNext ?
        generatorObject.throw(result) : generatorObject.next(result);
    value = pair.value;
    done = pair.done;
  } catch (e) {
    reject(e);
    return;
  }
  if (done) {
    resolve(value);
  } else {
    if (!value || !value.then) {
      ({value, done} = generatorObject.throw(new Error(
          "asyncf generator must return Promise but got " + value)));
    }
    value.then(nextResult => {
      _asyncfHelper(generatorObject, resolve, reject, nextResult);
    }, error => {
      _asyncfHelper(generatorObject, resolve, reject, error, true);
    });
  }
}

// Just run async block

function runAsyncf(generator) {
  asyncf(generator)().then(() => null);
}

// async Timeout

function asyncPause(duration) {
  return new Promise((resolve, reject) => {
    setTimeout(_ => { resolve(); }, duration);
  });
}

// Firebase utils (requires firebase)

function asyncReadFromFirebase(key) {
  return new Promise((resolve, reject) => {
    firebase.database().ref(key).once('value').then(snapshot => {
      resolve(snapshot.val());
    }, reject);
  });
}

function asyncWriteToFirebase(key, value) {
  return firebase.database().ref(key).set(value);
}

function deleteFromFirebase(key) {
  firebase.database().ref(key).remove();
}

function asyncWaitForUserLogin() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      if (user) {
        resolve(user);
        unsubscribe();
      }
    });
  });
}

function signInWithRedirect() {
  firebase.auth().signInWithRedirect(new firebase.auth.GoogleAuthProvider());
}

// unique id
let nextId = 1;
function getUniqueId() {
  return 'id' + nextId++;
}

// exports

exports.set = (name, value) => {
  if (exports[name] !== undefined) {
    throw new Error(name + " already set on lib");
  }
  exports[name] = value;
};

exports.set("asyncf", asyncf);
exports.set("runAsyncf", runAsyncf);
exports.set("asyncPause", asyncPause);
exports.set("asyncReadFromFirebase", asyncReadFromFirebase);
exports.set("asyncWriteToFirebase", asyncWriteToFirebase);
exports.set("deleteFromFirebase", deleteFromFirebase);
exports.set("asyncWaitForUserLogin", asyncWaitForUserLogin);
exports.set("signInWithRedirect", signInWithRedirect);
exports.set("getUniqueId", getUniqueId);

})(lib);


