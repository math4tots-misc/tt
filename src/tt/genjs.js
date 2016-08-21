// genjs.js
// Code generation, javascript

const err = require("./err.js");
const type = require("./type.js");
const annotator = require("./annotator.js");
const ttutils = require("./ttutils.js");

const CompileError = err.CompileError;
const SymbolType = type.SymbolType;
const parseAndAnnotate = annotator.parseAndAnnotate;
const serializeFunctionInstantiation =
    annotator.serializeFunctionInstantiation;

class CompilationContext {
  constructor(compiler, func) {
    this.compiler = compiler;
    this.func = func;
  }
  getCurrentFunction() {
    return this.func;
  }
  getTypeOfArgumentAtIndex(i) {
    return this.func.args[i][1];
  }
  getCurrentFunctionName() {
    return this.compiler.getFunctionNameFromFunctionNode(this.func);
  }
  getClassFromType(type) {
    return this.compiler.getClassFromType(type);
  }
}

function compile(uriTextPairs) {
  return new Compiler(uriTextPairs).compile();
}

const nativeTypedefs = `

/**
 * @typedef {!Array<!number>}
 */
var Stack;

`;

const nativePrelude = `
//// Begin native prelude

// If a TtError is thrown, the assumption will be that the
// runtime is still running fine. The exception was thrown
// in a controlled environment.
// As such, when displaying the error message, we shouldn't have to
// include the javascript stack trace.
//
// If any other kind of exception is thrown, it is a surprise to me and
// will be considered a bug in the implementation. As such it's important
// in this case to show the javascript stack trace.
class TtError extends Error {
  constructor(message) {
    super(message);
    this.ttmessage = message;
  }
}

/**
 * @private
 * @param {Stack} stack
 * @param {*} value
 */
function pop(stack, value) {
  stack.pop();
  return value;
}

/**
 * @private
 * @param {string} str
 * @param {number} len
 */
function padstr(str, len) {
  if (str.length < len) {
    return str + " ".repeat(len-str.length);
  } else {
    return str;
  }
}

/**
 * @private
 * @param {Stack} stack
 */
function getStackTraceMessage(stack) {
  let message = "\\nMost recent call last:";
  for (const tag of stack) {
    const [funcname, uri, lineno] = tagList[tag].split("@");
    message += "\\n  " + padstr(funcname, 20) +
               " in " + padstr("'" + uri + "'", 20) +
               " line " + padstr(lineno, 5);
  }
  return message;
}

function displayErrorAndDie(stack, e) {
  // If we have a TtError, we extract the message and omit the
  // javascript trace.
  // Otherwise, we dump as much as we can.
  const errorMessage = (e instanceof TtError) ?
                       e.ttmessage : e.toString();
  const javascriptTrace = (e instanceof TtError) ?
                          "" : e.stack;
  const stackTrace = stack.length > 0 ?
                     getStackTraceMessage(stack).trim() : "";
  console.error("==========================\\n" +
                "*** UNCAUGHT EXCEPTION ***\\n" +
                "==========================\\n" +
                errorMessage + "\\n" +
                stackTrace + "\\n" +
                javascriptTrace);
  throw e;
}

/**
 * @private
 * @param {function(Stack):void} f
 * @param {Stack=} stack
 */
function tryOrDie(f, stack) {
  stack = stack || makeStack();
  try {
    f(stack);
  } catch (e) {
    displayErrorAndDie(stack, e);
  } finally {
    deleteStack(stack);
  }
}

/**
 * @private
 */
function asyncf(unwrappedGenerator) {
  function* generator() {
    const oldStack = arguments[0];
    // When starting a new async context, we need to make a copy of the
    // old stack, since there could potentially be multiple async contexts
    // started before being 'await'ed on.
    const stack = makeStack(oldStack);
    const args = [stack];
    for (let i = 1; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    try {
      return yield* unwrappedGenerator.apply(null, args);
    } catch(e) {
      // Keep a copy of the stack so that whoever catches it knows where
      // it came from.
      // I thought about modifying the oldStack, but that would involve
      // knowing exactly when the caller is going to resume.
      // when we reject, we don't know if 'then' or 'catch' has been called
      // on the promise yet, so there might actually be other stuff going
      // on clobbering the stack before dealing with this.
      if (!e.ttstackSnapshot) {
        e.ttstackSnapshot = Array.from(stack);
      }
      throw e;
    } finally {
      deleteStack(stack);
    }
  }
  return function(oldStack) {
    const generatorObject = generator.apply(null, arguments);
    return newPromise(oldStack, (resolve, reject) => {
      asyncfHelper(generatorObject, resolve, reject);
    });
  }
}

/**
 * @private
 * @param {*=} val
 * @param {boolean=} thr
 */
function asyncfHelper(generatorObject, resolve, reject, val, thr) {
  try {
    const {value, done} =
        thr ? generatorObject.throw(val) : generatorObject.next(val);
    if (done) {
      resolve(value);
    } else {
      markPromiseAwaited(value);
      value.then(val => {
        finalizePromise(value);
        asyncfHelper(generatorObject, resolve, reject, val);
      }).catch(err => {
        finalizePromise(value);
        asyncfHelper(generatorObject, resolve, reject, err, true);
      });
    }
  } catch (e) {
    reject(e);
  }
}

/**
 * Maps each promise to a snapshot of the stack when it was created
 * @type{!Map<!Promise, Stack>}
 */
const promiseStackSnapshot = new Map();

function getStackSnapshotOfPromise(promise) {
  if (!promiseStackSnapshot.has(promise)) {
    throw new Error("Unregistered promise: " + promise);
  }
  return promiseStackSnapshot.get(promise);
}
function addStackSnapshotForPromise(stack, promise) {
  promiseStackSnapshot.set(promise, Array.from(stack));
}
function removeStackSnapshotForPromise(promise) {
  promiseStackSnapshot.delete(promise);
}

/**
 * Maps each stack to a set of promises created while that stack was
 * active.
 * @type{!Map<!Array<number>, !Set<!Promise>>}
 */
const promisePool = new Map();

function initializePromisePool(stack) {
  promisePool.set(stack, new Set());
}
function finalizePromisePool(stack) {
  const remainingPromises = promisePool.get(stack);
  if (remainingPromises.size > 0) {
    let message = "await or runAsync not used on some promise(s)";
    for (const promise of remainingPromises) {
      message +=
          getStackTraceMessage(getStackSnapshotOfPromise(promise));
    }
    throw new TtError(message);
  }
}
function addToPromisePool(stack, promise) {
  promisePool.get(stack).add(promise);
}
function removeFromPromisePool(promise) {
  promisePool.get(promiseToStackMap.get(promise)).delete(promise);
}

/**
 * @type{!Map<!Promise, !Array<number>>}
 */
const promiseToStackMap = new Map();

// let nextPromiseId = 1;
function newPromise(stack, resolver) {
  return registerPromise(stack, new Promise(resolver));
}

function registerPromise(stack, promise) {
  promiseToStackMap.set(promise, stack);
  // const id = nextPromiseId++;
  // promise.id = id;
  // console.error("newPromise id = " + id + " stack.id = " + stack.id);
  addToPromisePool(stack, promise);
  addStackSnapshotForPromise(stack, promise);
  return promise;
}

function markPromiseAwaited(promise) {
  // console.error("markPromiseAwaited id = " + promise.id);
  removeFromPromisePool(promise);
}
function finalizePromise(promise) {
  // console.error("finalizePromise id = " + promise.id);
  promiseToStackMap.delete(promise);
  removeStackSnapshotForPromise(promise);
}

// let nextStackId = 1;
/**
 * @param {Stack=} oldStack
 */
function makeStack(oldStack) {
  const stack = oldStack ? Array.from(oldStack) : [];
  initializePromisePool(stack);
  // const id = nextStackId++;
  // stack.id = id;
  // console.error("makeStack id = " + id);
  return stack;
}

/**
 * @param {Stack} oldStack
 */
function makeCallbackStack(oldStack) {
  const part = oldStack.length > 0 ? [oldStack[oldStack.length-1]] : [];
  return makeStack(part);
}

function deleteStack(stack) {
  // console.error("deleteStack id = " + stack.id);
  finalizePromisePool(stack);
}

function runCallback(f, oldStack) {
  return tryOrDie(f, makeCallbackStack(oldStack));
}

//// End native prelude`;

function doEval(str) {
  // jshint evil: true
  return eval(str);
}

function blockHasAutos(node) {
  for (const stmt of node.stmts) {
    if (stmt.type === "Declaration" && stmt.isAuto) {
      return true;
    }
  }
  return false;
}

function transformBlockWithAutos(node) {
  if (!blockHasAutos(node)) {
    return node;
  }
  let i = 0;
  while (true) {
    const stmt = node.stmts[i];
    if (stmt.type === "Declaration" && stmt.isAuto) {
      break;
    }
    i++;
  }
  const decl = node.stmts[i];
  const firstBlock = {
    "type": "Block",
    "token": node.token,
    "stmts": node.stmts.slice(0, i+1),
  };
  const secondBlock = transformBlockWithAutos({
    "type": "Block",
    "token": decl.token,
    "stmts": node.stmts.slice(i+1),
  });
  const finallyBlock = {
    "type": "Block",
    "token": decl.token,
    "stmts": [{
        "type": "ExpressionStatement",
        "token": decl.token,
        "expr": {
          "type": "FunctionCall",
          "token": decl.token,
          "name": "delete",
          "args": [{
            "type": "Name",
            "token": decl.token,
            "name": decl.name,
            "exprType": decl.cls,
          }],
          // HACK: The return type of the delete function
          // should not be relevant.
          "exprType": null,
        },
    }],
  };
  firstBlock.stmts.push({
    "type": "TryFinally",
    "token": decl.token,
    "body": secondBlock,
    "fin": finallyBlock,
  });
  return firstBlock;
}

class Compiler {
  constructor(uriTextPairs) {
    this._uriTextPairs = uriTextPairs;
    this._nextId = 1;
    this._nameCache = Object.create(null);
    this._tagCache = Object.create(null);
    this._tagList = [];
    this._program = parseAndAnnotate(this._uriTextPairs);
    this._funcs = this._program.funcs;
    this._clss = this._program.clss;
    this._decls = this._program.decls;
    this._currentFunctionContext = null;
    this._typeToClassCache = Object.create(null);

    for (const cls of this._clss) {
      this.initializeClassNameFromNode(cls);
    }

    for (const func of this._funcs) {
      this.initializeFunctionNameFromNode(func);
    }
  }
  getNewId() {
    return this._nextId++;
  }
  initializeFunctionNameFromNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg[1]);
    const key = serializeFunctionInstantiation(name, argtypes);
    this._nameCache[key] = name + "__$" + this.getNewId();
  }
  initializeClassNameFromNode(node) {
    const name = node.pattern.name;
    const key = node.pattern.toString();
    this._nameCache[key] = name + "__$" + this.getNewId();
  }
  getClassFromType(type) {
    const key = type.toString();
    if (!this._typeToClassCache[key]) {
      for (const cls of this._clss) {
        if (cls.pattern.equals(type)) {
          this._typeToClassCache[key] = cls;
          break;
        }
      }
      if (!this._typeToClassCache[key]) {
        throw new Error(key);
      }
    }
    return this._typeToClassCache[key];
  }
  getFunctionNameFromNameAndArgtypes(name, argtypes, tokens) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!this._nameCache[key]) {
      throw new CompileError("No such function: " + key, tokens || []);
    }
    return this._nameCache[key];
  }
  getFunctionNameFromFunctionNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg[1]);
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!this._nameCache[key]) {
      throw new CompileError(
          "Function never instantiated: " + key, []);
    }
    return this._nameCache[key];
  }
  getFunctionNameFromFunctionCallNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg.exprType);
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!this._nameCache[key]) {
      throw new CompileError(
          "Function never instantiated: " + key, [node.token]);
    }
    return this._nameCache[key];
  }
  getClassNameFromClassNode(node) {
    const key = node.pattern.toString();
    if (!this._nameCache[key]) {
      throw new CompileError(
          "Class never instantiated: " + key, [node.token]);
    }
    return this._nameCache[key];
  }
  getClassNameFromType(type) {
    if (type instanceof SymbolType) {
      return "undefined";
    }
    const key = type.toString();
    if (!this._nameCache[key]) {
      throw new CompileError("Class never instantiated: " + key, []);
    }
    return this._nameCache[key];
  }
  getClassNode(cls) {
    for (const c of this._clss) {
      if (c.pattern.equals(cls)) {
        return c;
      }
    }
    return null;
  }
  compile() {
    let result = "// Autogenerated by the tt->js compiler";
    result += nativeTypedefs;
    result += "\n// --- typedefs ---";
    for (const cls of this._clss) {
      result += this.compileClass(cls);
    }
    result += "\n(function() {";
    result += '\n"use strict";';
    result += nativePrelude;
    result += "\n// --- global variable declarations ---";
    // TODO: Move the global declaration assignments to a static block,
    // and don't declare a global "stack" variable.
    result += "\nconst stack = [];";
    for (const decl of this._decls) {
      result += this.compileStatement(decl);
    }
    result += "\n// --- function definitions ---";
    const funcs = this._funcs;
    for (const func of funcs) {
      result += this.compileFunction(func);
    }
    result += "\n// --- tag list, for generating helpful stack traces ---";
    result += "\nconst tagList = " + JSON.stringify(this._tagList) + ";";
    result += "\ntryOrDie(stack => {";
    result += "\n// --- call all the static stuff ---";
    for (const func of funcs) {
      if (func.isStatic) {
        result +=
            "\n" + this.getFunctionNameFromNameAndArgtypes(func.name, []) +
            "(stack);";
      }
    }
    result += "\n// --- finally call main ---";
    result += "\n" + this.getFunctionNameFromNameAndArgtypes("main", []) +
              "(stack);";
    result += "\n});";
    result += "\n})();";
    return result.trim();
  }
  compileClass(cls) {
    if (cls.isNative) {
      return this.compileNativeClass(cls);
    } else if (cls.isAbstract) {
      return this.compileAbstractClass(cls);
    } else {
      return this.compileNormalClass(cls);
    }
  }
  compileNormalClass(cls) {
    const name = this.getClassNameFromClassNode(cls);
    let s = "\n/**";
    s += "\n * " + cls.pattern.toString();
    s += "\n * @typedef{";
    if (cls.attrs.length === 0) {
      // If a class has no attributes, closure-compiler complains.
      s += "Object<?,?>";
    } else {
      let first = true;
      s += "{";
      for (const [name, type] of cls.attrs) {
        if (!first) {
          s += ",";
        }
        s += "aa" + name + ":" + this.getClassNameFromType(type);
        first = false;
      }
      s += "}";
    }
    s += "}";
    s += "\n */";
    s += "\nvar " + name + ";";
    return s;
  }
  compileNativeClass(cls) {
    const name = this.getClassNameFromClassNode(cls);
    let s = "\n/**";
    s += "\n * " + cls.pattern.toString();
    s += "\n * @typedef{";
    if (cls.nativeAnnotation) {
      s += cls.nativeAnnotation;
    } else {
      s += "*";
    }
    s += "}";
    s += "\n */";
    s += "\nvar " + name + ";";
    return s;
  }
  compileAbstractClass(cls) {
    let s = "\n/**";
    s += "\n * (abstract) " + cls.pattern.toString();
    s += "\n */";
    return s;
  }
  compileArguments(rawArgs) {
    let nextNullArgId = 0;
    const args = [];
    for (const [rawName, cls] of rawArgs) {
      let name;
      if (rawName === null) {
        name = "varnull_" + nextNullArgId++;
      } else {
        name = "var_" + rawName;
      }
      args.push([name, cls]);
    }
    return "(stack" +
           args.map(arg => ", " + arg[0] + "/*" +
                           arg[1].toString() + "*/").join("") +
           ")";
  }
  compileFunction(func) {
    const token = func.token;
    const isAsync = func.isAsync;
    const argnames = func.args.map(arg => arg[0]);
    const argtypes = func.args.map(arg => arg[1]);
    const name = this.getFunctionNameFromFunctionNode(func);
    const args = this.compileArguments(func.args) +
                 " /*" + func.ret.toString() + "*/";
    let ann = "\n/** ";
    ann += "\n * @private";
    for (let [n, t] of func.args) {
      if (n === null) {
        continue;
      }
      ann += "\n * @param {" + this.getClassNameFromType(t) + "} var_" + n;
    }
    ann += "\n * @return {" + this.getClassNameFromType(func.ret) + "}";
    ann += "\n */";
    if (func.isNative) {
      let body = func.body;
      if (body.startsWith("eval")) {
        const f = doEval(body.slice("eval".length));
        body = f(new CompilationContext(this, func));
      }
      return "\n\n// native function: " +
             serializeFunctionInstantiation(func.name, argtypes) +
             func.ret.toString() +
             "\nfunction " + name + args + "\n{" + body + "\n}";
    }
    this._currentFunctionContext =
        serializeFunctionInstantiation(func.name, argtypes);
    const compiledBody = this.compileStatement(func.body);
    this._currentFunctionContext = null;
    let result = name + args + compiledBody;
    if (isAsync) {
      result = "const " + name +
               " = (() => asyncf(function* " + result + "))();";
    } else {
      result = "function " + result;
    }
    return "\n" + ann + "\n" + result;
  }
  compileStatement(node) {
    switch(node.type) {
    case "Block": {
      const n = transformBlockWithAutos(node);
      const stmts = n.stmts.map(stmt => this.compileStatement(stmt));
      return "\n{" + stmts.join("").replace(/\n/g, "\n  ") + "\n}";
    }
    case "ExpressionStatement":
      return "\n" + this.compileTopLevelExpression(node.expr) + ";";
    case "Return":
      if (node.expr === null) {
        return "\nreturn;";
      }
      return "\nreturn " + this.compileTopLevelExpression(node.expr) + ";";
    case "Declaration":
      const keyword = node.isFinal ? "const" : "let";
      const val = this.compileTopLevelExpression(node.val);
      return "\n" + keyword + " var_" + node.name + " = " + val + ";";
    case "TryFinally":
      return "\ntry" + this.compileStatement(node.body) +
             "\nfinally" + this.compileStatement(node.fin);
    case "For":
      return "\nfor (" +
             (this.init === null ?
              ";" : this.compileStatement(node.init).trim()) +
             (node.cond === null ?
              "" : this.compileTopLevelExpression(node.cond)) + ";" +
             (node.incr === null ?
              "" : this.compileTopLevelExpression(node.incr)) + ")" +
             this.compileStatement(node.body);
    case "While":
      return "\nwhile (" + this.compileTopLevelExpression(node.cond) + ")" +
             this.compileStatement(node.body);
    case "Break":
      return "\nbreak;";
    case "Continue":
      return "\ncontinue;";
    case "If":
      let str = "\nif (" + this.compileTopLevelExpression(node.cond) + ")" +
                this.compileStatement(node.body);
      if (node.other !== null) {
        str += "\nelse" + this.compileStatement(node.other);
      }
      return str;
    default:
      throw new CompileError(
          "Unrecognized statement: " + node.type, [node.token]);
    }
  }
  compileTopLevelExpression(node) {
    const tag = this.getTagFromToken(node.token);
    return "(stack.push(" + tag + "),pop(stack," +
           this.compileInnerExpr(node) + "))";
  }
  compileInnerExpr(node) {
    switch(node.type) {
    case "FunctionCall":
      const fname = node.name;
      const args = node.args;
      return this.getFunctionNameFromFunctionCallNode(node) + "(stack" +
             args.map(arg => "," + this.compileInnerExpr(arg)).join("") +
             ")";
    case "Malloc": {
      // HACK: This is a hack. See the comment about this in tt.js
      let attrstr = "";
      for (let i = 0; i < node.args.length; i++) {
        if (i > 0) {
          attrstr += ",";
        }
        attrstr += "aa" + node.attrnames[i] + ":" +
                   this.compileInnerExpr(node.args[i]);
      }
      return "{" + attrstr + "}";
    }
    case "true":
    case "false":
      return node.type;
    case "Int":
    case "Float":
      return node.val;
    case "String":
      return '"' + ttutils.sanitizeString(node.val) + '"';
    case "Name":
      return "var_" + node.name;
    case "TypeExpression":
      return "undefined";
    case "ListDisplay":
      return "[" + node.exprs.map(expr => this.compileInnerExpr(expr)) + "]";
    case "Assign":
      return "(var_" + node.name + " = " +
             this.compileInnerExpr(node.val) + ")";
    case "AugmentAssign":
      if (node.val === null) {
        return "(var_" + node.name + " " + node.op + ")";
      }
      return "(var_" + node.name + " " + node.op + " " +
             this.compileInnerExpr(node.val) + ")";
    case "GetAttribute":
      return this.compileInnerExpr(node.owner) + ".aa" + node.name;
    case "SetAttribute":
      return this.compileInnerExpr(node.owner) + ".aa" + node.name +
             " = " + this.compileInnerExpr(node.val);
    case "LogicalBinaryOperation":
      return "(" + this.compileInnerExpr(node.left) + node.op +
             this.compileInnerExpr(node.right) + ")";
    case "Await":
      return "(yield " + this.compileInnerExpr(node.expr) + ")";
    case "Lambda":
      if (node.isAsync) {
        return "asyncf(function*" + this.compileArguments(node.args) +
               this.compileStatement(node.body) + ")";
      }
      return "(" + this.compileArguments(node.args) + " => " +
              this.compileStatement(node.body) + ")";
    default:
      throw new CompileError(
          "Unrecognized expression: " + node.type, [node.token]);
    }
  }
  getTagFromToken(token) {
    const message = token.getTagMessage(this._currentFunctionContext);
    if (this._tagCache[message] === undefined)  {
      this._tagCache[message] = this._tagList.length;
      this._tagList.push(message);
    }
    return this._tagCache[message];
  }
}


exports.compile = compile;

