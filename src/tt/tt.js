// tt.js

// Before I used to split everything out into many files (see oldtt/),
// but this made it more difficult to include tt.js in the browser.
// My editor is pretty good even when navigating files of this size,
// and it's convenient to do this, so unless there's any other super
// serious reason to do otherwise, I'm going to keep everything
// shared between the browser version and the local version
// in this one file.

const tt = (function() {
"use strict";

//// ttutils.js

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

//// err.js

class CompileError extends Error {
  constructor(message, tokens) {
    super(message + tokens.map(token => token.getLocationMessage()).join(""));
  }
}

class InstantiationError extends CompileError {
  constructor(message, frames) {
    super(message +
          frames.map(frame =>
              frame.getFrameMessage()).join("").replace(/\n/g, "\n  "),
          []);
  }
}

class InstantiationFrame {
  constructor(token, context) {
    this.token = token;
    this.context = context;
  }
  getFrameMessage() {
    return "\nwhile instantiating " + this.context + " " +
           this.token.getLocationMessage().trim();
  }
}

function assertEqual(left, right) {
  if (left !== right) {
    throw new CompileError(
        "assertEqual failed: left = " + left + ", right = " + right, []);
  }
}

class Source {
  constructor(uri, text) {
    this.uri = uri;
    this.text = text;
  }
}

class Token {
  constructor(source, pos, type, val) {
    this.source = source;
    this.pos = pos;
    this.type = type;
    this.val = val;
    this.funcname = null;  // filled in during parsing
    this.funcnameset = false;
  }
  getLineNumber() {
    let ln = 1;
    const text = this.source.text;
    for (let i = 0; i < this.pos; i++) {
      if (text[i] === "\n") {
        ln++;
      }
    }
    return ln;
  }
  getFunctionName() {
    if (this.funcname === null) {
      throw new CompileError("No function name for " + this, []);
    }
    return this.funcname;
  }
  setFunctionName(name) {
    if (this.funcnameset) {
      throw new CompileError("Function name already set for " + this, []);
    }
    this.funcname = name;
    this.funcnameset = true;
  }
  getColumnNumber() {
    let cn = 1;
    const text = this.source.text;
    for (let i = this.pos; i > 0 && text[i-1] !== "\n"; i--) {
      cn++;
    }
    return cn;
  }
  getLine() {
    let start = this.pos, end = this.pos;
    const text = this.source.text;
    while (start > 0 && text[start-1] !== "\n") {
      start--;
    }
    while (end < text.length && text[end] !== "\n") {
      end++;
    }
    return text.slice(start, end);
  }
  getLocationMessage() {
    return "\nin " + this.source.uri + ", line " + this.getLineNumber() +
           "\n" + this.getLine() +
           "\n" + " ".repeat(this.getColumnNumber()-1) + "*";
  }
  toString() {
    return "Token(" + this.type + ", " + this.val + ")";
  }
  inspect() {
    return this.toString();
  }
  getTagMessage(context) {
    return context + "@" + this.source.uri + "@" +
           this.getLineNumber();
  }
}

//// lexer.js

const keywords = [
  "fn", "class", "interface", "implement",
  "let", "final", "auto", "static", "native", "async", "await",
  "abstract",
  "return",
  "is", "not", "in",
  "for", "if", "else", "while", "break", "continue",
  "true", "false",

  "and", "or", "null",
  "var", "const", "goto", "function", "def", "const",
  "package", "import", "as",
];
const symbols = [
  "(", ")", "[", "]", "{", "}", ",", ".", "...",
  "@", ";", "#", "$", "=",
  "+", "-", "*", "/", "%", "++", "--",
  "|", "&",
  "&&", "||", "?", ":",
  "==", "!=", "<", ">", "<=", ">=", "!",
  "+=", "-=", "*=", "/=", "%=",
].sort().reverse();
const openParen = "(";
const closeParen = ")";
const openBracket = "[";
const closeBracket = "]";
const openBrace = "{";
const closeBrace = "}";

function isKeyword(name) {
  return keywords.indexOf(name) !== -1;
}

function isTypename(name) {
  return name[0].toUpperCase() === name[0] &&
         name[0].toLowerCase() !== name[0];
}

function isDigit(ch) {
  return /\d/.test(ch);
}

function isNameChar(ch) {
  return /\w/.test(ch);
}

class Lexer {
  constructor(uri, text) {
    this._source = new Source(uri, text);
    this._text = text;
    this._pos = 0;
    this._peek = this._extract();
  }
  peek() {
    return this._peek;
  }
  next() {
    const token = this._peek;
    this._peek = this._extract();
    return token;
  }
  _ch(dx) {
    const text = this._text;
    const pos = this._pos + (dx || 0);
    return pos < text.length ? text[pos] : "";
  }
  _startsWith(prefix) {
    return this._text.startsWith(prefix, this._pos);
  }
  _skipWhitespaceAndComments() {
    while (this._ch() !== "" &&
           (" \r\n\t".indexOf(this._ch()) !== -1 ||
            this._startsWith("//") ||
            this._startsWith("/*"))) {
      if (this._startsWith("//")) {
        while (this._ch() !== "" && this._ch() !== "\n") {
          this._pos++;
        }
      } else if (this._startsWith("/*")) {
        const start = this._pos;
        this._pos += 2;
        while (this._ch() !== "" && !this._startsWith("*/")) {
          this._pos++;
        }
        if (this._ch() === "") {
          throw new CompileError(
              "Unterminated multiline comment",
              [new Token(this._source, start, "ERROR")]);
        }
        this._pos += 2;
      } else {
        this._pos++;
      }
    }
  }
  _extract() {
    this._skipWhitespaceAndComments();
    if (this._ch() === "") {
      return new Token(this._source, this._pos, "EOF");
    }
    const start = this._pos;
    // STRING
    if (this._startsWith('r"') || this._startsWith('"') ||
        this._startsWith("r'") || this._startsWith("'")) {
      let raw = false;
      if (this._ch() === "r") {
        raw = true;
        this._pos++;
      }
      let quote = this._ch();
      if (this._startsWith(quote.repeat(3))) {
        quote = quote.repeat(3);
      }
      this._pos += quote.length;
      let str = "";
      while (this._ch() !== "" && !this._startsWith(quote)) {
        if (!raw && this._ch() === "\\") {
          this._pos++;
          switch(this._ch()) {
          case "t": str += "\t"; break;
          case "n": str += "\n"; break;
          case "f": str += "\f"; break;
          case "r": str += "\r"; break;
          case "\\": str += "\\"; break;
          case "'": str += "'"; break;
          case '"': str += '"'; break;
          default:
            throw new CompileError(
                "Unrecognized string escape",
                [new Token(this._source, this._pos, "ERROR")]);
          }
          this._pos++;
        } else {
          str += this._ch();
          this._pos++;
        }
      }
      this._pos += quote.length;
      return new Token(this._source, start, "STRING", str);
    }
    // INT/FLOAT
    let foundDigit = false, foundDot = false;
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (this._ch() === ".") {
      this._pos++;
      foundDot = true;
    }
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (foundDigit) {
      const val = this._text.slice(start, this._pos);
      if (foundDot) {
        return new Token(this._source, start, "FLOAT", val);
      } else {
        return new Token(this._source, start, "INT", val);
      }
    } else {
      this._pos = start;
    }
    // NAME/TYPENAME/KEYWORD
    while (isNameChar(this._ch())) {
      this._pos++;
    }
    if (start !== this._pos) {
      const name = this._text.slice(start, this._pos);
      const type =
          isKeyword(name) ? name :
          isTypename(name) ? "TYPENAME" :
          "NAME";
      return new Token(
          this._source, start, type, type === name ? undefined : name);
    }
    // SYMBOL
    for (const symbol of symbols) {
      if (this._startsWith(symbol)) {
        this._pos += symbol.length;
        return new Token(this._source, start, symbol);
      }
    }
    // ERROR
    const token = new Token(this._source, start, "ERROR");
    throw new CompileError("Unrecognized token", [token]);
  }
}

function lex(uri, text) {
  const lexer = new Lexer(uri, text);
  const tokens = [];
  while (lexer.peek().type !== "EOF") {
    tokens.push(lexer.next());
  }
  tokens.push(lexer.peek());
  return tokens;
}

{
  const tokens = lex("<test>", "aa Bb class 1 2.4 'hi' ++");
  const types = tokens.map(token => token.type).join(",");
  assertEqual("NAME,TYPENAME,class,INT,FLOAT,STRING,++,EOF", types);
  const vals = tokens
      .map(token => token.val).map(val => val === undefined ? "" : val)
      .join(",");
  assertEqual("aa,Bb,,1,2.4,hi,,", vals);
}

//// type.js

class Type {}

class Typename extends Type {
  constructor(name) {
    super();
    this.name = name;
  }
  equals(other) {
    return other instanceof Typename && this.name === other.name;
  }
  toString() {
    return this.name;
  }
  inspect() {
    return "Typename(" + this.name + ")";
  }
}

class SymbolType extends Type {
  constructor(name) {
    super();
    this.name = name;
  }
  equals(other) {
    return other instanceof SymbolType && this.name === other.name;
  }
  toString() {
    return ":" + this.name;
  }
  inspect() {
    return "SymbolType(" + this.name + ")";
  }
}

class TemplateType extends Type {
  constructor(name, args) {
    super();
    this.name = name;  // TYPENAME
    this.args = args;  // [Type]
  }
  equals(other) {
    if (!(other instanceof TemplateType)) {
      return false;
    }
    if (this.args.length !== other.args.length) {
      return false;
    }
    for (let i = 0; i < this.args.length; i++) {
      if (!this.args[i].equals(other.args[i])) {
        return false;
      }
    }
    return true;
  }
  toString() {
    return this.name + "[" +
           this.args.map(arg => arg.toString()).join(",") + "]";
  }
  inspect() {
    return "TemplateType(" + this.name + ", [" +
           this.args.map(arg => arg.toString()).join(", ") + "])";
  }
}

//// typet.js

class TypeTemplate {
  constructor(token) {
    this.token = token;
  }
  isFreeVar(boundVars) {
    return this instanceof VariableTypeTemplate &&
           this.hasFreeVars(boundVars);
  }
  hasFreeVars(boundVars) {
    return Object.keys(this.getFreeVars(boundVars)).length > 0;
  }
  compareSpecialization(other, boundVars, otherBoundVars) {
    // returns 1 (i.e. this > otherTemplate) if this is more specialized
    // returns 0 (i.e. this == otherTemplate) if the level is the same
    // returns -1 (i.e. this < otherTemplate) if other is more specialized
    boundVars = boundVars || Object.create(null);
    otherBoundVars = otherBoundVars || Object.create(null);
    let self = this;
    // For 'And' types, we really only care about the most specialized
    // version.
    if (self instanceof AndTypeTemplate) {
      self = self.getMostSpecialized(boundVars);
    }
    if (other instanceof AndTypeTemplate) {
      other = self.getMostSpecialized(boundVars);
    }
    if (self instanceof OrTypeTemplate && other instanceof OrTypeTemplate) {
      // TODO: Figure out a more sensible ordering. For now, having
      // something that are both 'or' types that can potentially have
      // multiple implementations is a bad situation.
      return 0;
    }
    if (!(self instanceof OrTypeTemplate) &&
        other instanceof OrTypeTemplate) {
      return 1;
    }
    if (self instanceof OrTypeTemplate &&
        !(other instanceof OrTypeTemplate)) {
      return -1;
    }
    const thisHasFreeVars = self.hasFreeVars(boundVars);
    const otherHasFreeVars = other.hasFreeVars(otherBoundVars);
    if (!thisHasFreeVars && !otherHasFreeVars) {
      return 0;
    }
    if (!thisHasFreeVars && otherHasFreeVars) {
      return 1;
    }
    if (thisHasFreeVars && !otherHasFreeVars) {
      return -1;
    }
    const thisIsFreeVar = self.isFreeVar(boundVars);
    const otherIsFreeVar = other.isFreeVar(otherBoundVars);
    if (thisIsFreeVar && otherIsFreeVar) {
      return 0;
    }
    if (!thisIsFreeVar && otherIsFreeVar) {
      return 1;
    }
    if (thisIsFreeVar && !otherIsFreeVar) {
      return -1;
    }
    // At self point, both sides have some free vars, but neither of them
    // *is* a free var. This must mean that they are both
    // TemplateTypeTemplates.
    const args = self.args;
    const oargs = other.args;
    const len = Math.min(args.length, oargs.length);
    boundVars = Object.create(boundVars);
    otherBoundVars = Object.create(otherBoundVars);
    for (let i = 0; i < len; i++) {
      const result = args[i].compareSpecialization(
          oargs[i], boundVars, otherBoundVars);
      if (result !== 0) {
        return result;
      }
      for (const freeVar in args[i].getFreeVars(boundVars)) {
        boundVars[freeVar] = true;
      }
      for (const freeVar in oargs[i].getFreeVars(otherBoundVars)) {
        otherBoundVars[freeVar] = true;
      }
    }
    // If one has vararg and the other doesn't, the one that doesn't have
    // a vararg is more specialized.
    if (self.vararg === null && other.vararg !== null) {
      return 1;
    }
    if (self.vararg !== null && other.vararg === null) {
      return -1;
    }
    // They either both have varargs, or they both don't.
    // If they both don't have varargs, it's not really comparable, so
    // ordering doesn't matter as long as we are consistent.
    // On the other hand, if they both have varargs, the type template
    // with more explicit explicit arguemnts is more specialized.
    if (args.length !== oargs.length) {
      // We don't *really* care if the lengths aren't the same.
      // Just to be consistent about the ordering, let's say that
      // longer means more specialized.
      return args.length < oargs.length ? -1 : 1;
    }
    return 0;
  }
}

class TypenameTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof Typename) || this.name !== type.name) {
      return null;
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    return Object.create(null);
  }
  resolve(bindings) {
    return new Typename(this.name);
  }
  serialize(bindings) {
    return this.name;
  }
}

class SymbolTypeTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof SymbolType) || this.name !== type.name) {
      return null;
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    return Object.create(null);
  }
  resolve(bindings) {
    return new SymbolType(this.name);
  }
  serialize(bindings) {
    return ":" + this.name;
  }
}

class AndTypeTemplate extends TypeTemplate {
  constructor(token, templates) {
    super(token);
    this.templates = templates;
  }
  getMostSpecialized(boundVars) {
    let m = this.templates[0];
    for (const t of this.templates) {
      if (m.compareSpecialization(t) < 0) {
        m = t;
      }
    }
    return m;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    for (const t of this.templates) {
      bindings = t.bindType(type, bindings);
      if (bindings === null) {
        return null;
      }
    }
    return bindings;
  }
  resolve(bindings) {
    return this.templates[0].resolve(bindings);
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    for (const t of this.templates) {
      for (const freeVar in t.getFreeVars(boundVars)) {
        freeVars[freeVar] = true;
      }
    }
    return freeVars;
  }
  serialize(bindings) {
    return this.templates.map(t => t.serialize(bindings)).join("=");
  }
}

class OrTypeTemplate extends TypeTemplate {
  constructor(token, templates) {
    super(token);
    this.templates = templates;
  }
  resolve(bindings) {
    return this.templates[bindings["|or"].get(this)].resolve(bindings);
  }
  bindType(type, bindings) {
    const m = bindings["|or"] || new Map();
    bindings["|or"] = m;
    for (let i = 0; i < this.templates.length; i++) {
      const t = this.templates[i];
      const b = Object.create(null);
      for (const k in bindings) {
        b[k] = bindings[k];
      }
      b["|or"] = new Map(m.get("|or"));
      const bb = t.bindType(type, b);
      if (bb) {
        m.set(this, i);
        return t.bindType(type, bindings);
      }
    }
    return null;
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    for (const t of this.templates) {
      for (const freeVar in t.getFreeVars(boundVars)) {
        freeVars[freeVar] = true;
      }
    }
    if (!(boundVars["|or"] && boundVars["|or"].has(this))) {
      freeVars["|or"] = true;
    }
    return freeVars;
  }
  serialize(bindings) {
    return this.templates.map(t => t.serialize(bindings)).join("|");
  }
}

class TemplateTypeTemplate extends TypeTemplate {
  constructor(token, name, args, vararg) {
    super(token);
    this.name = name;  // TYPENAME
    this.args = args;  // [TypeTemplate]
    this.vararg = vararg || null;  // null|TYPENAME
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof TemplateType) || this.name !== type.name) {
      return null;
    }
    if (this.vararg === null && this.args.length !== type.args.length ||
        this.args.length > type.args.length) {
      return null;
    }
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i].bindType(type.args[i], bindings) === null) {
        return null;
      }
    }
    if (this.vararg !== null) {
      const rest = [];
      for (let i = this.args.length; i < type.args.length; i++) {
        rest.push(type.args[i]);
      }
      const key = "..." + this.vararg;
      if (bindings[key]) {
        const oldRest = bindings[key];

        // If this 'vararg' name already exists, make sure that they match
        // this comparison is simpler since these should be a list of
        // concrete types
        if (oldRest.length !== rest.length) {
          return null;
        }
        const len = rest.length;
        for (let i = 0; i < len; i++) {
          if (!rest[i].equals(oldRest[i])) {
            return null;
          }
        }
      } else {
        bindings["..." + this.vararg] = rest;
      }
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    for (const arg of this.args) {
      for (const freeVar in arg.getFreeVars(boundVars)) {
        freeVars[freeVar] = true;
      }
    }
    return freeVars;
  }
  resolve(bindings) {
    const args = this.args.map(arg => arg.resolve(bindings));
    if (this.vararg) {
      const key = "..." + this.vararg;
      if (!bindings[key]) {
        throw new CompileError(
            "Tried to resolve type template for " + key + " but no " +
            "binding found", [this.token]);
      }
      for (const arg of bindings[key]) {
        args.push(arg);
      }
    }
    return new TemplateType(this.name, args);
  }
  serialize(bindings) {
    bindings = bindings || {_nextIndex: 0};
    let args = this.args.map(arg => arg.serialize(bindings)).join(",");
    let vararg = "";
    if (this.vararg !== null) {
      if (bindings["..." + this.vararg] === undefined) {
        bindings["..." + this.vararg] = bindings._nextIndex++;
      }
      vararg = "..." + bindings["..." + this.vararg];
    }
    return this.name + "[" + args + vararg + "]";
  }
}

class VariableTypeTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (bindings[this.name]) {
      if (bindings[this.name].equals(type)) {
        return bindings;
      } else {
        return null;
      }
    } else {
      bindings[this.name] = type;
      return bindings;
    }
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    if (!boundVars[this.name]) {
      freeVars[this.name] = true;
    }
    return freeVars;
  }
  resolve(bindings) {
    if (!bindings[this.name]) {
      throw new CompileError(
          "Tried to resolve type template for $" + this.name + " but no " +
          "binding found", [this.token]);
    }
    return bindings[this.name];
  }
  serialize(bindings) {
    bindings = bindings || {_nextIndex: 0};
    if (bindings["$" + this.name] === undefined) {
      bindings["$" + this.name] = bindings._nextIndex++;
    }
    return "$" + bindings["$" + this.name];
  }
}


//// parser.js

const augmentAssignOperands = [
  "+=", "-=",  "/=",  "*=", "%=",
  "++", "--",
];

// HACK: staticBlockIds have to be unique across the entire program.
// TODO: Pay back this code debt.
let nextStaticBlockId = 0;

class Parser {
  constructor(uri, text) {
    this._tokens = lex(uri, text);
    this._pos = 0;
    this._funcname = null;
    this._staticBlockId = 0;
    this._insideAsync = false;
  }
  getNextStaticBlockId() {
    return nextStaticBlockId++;
  }
  peek(dx) {
    const pos = Math.min(this._pos + (dx || 0), this._tokens.length-1);
    return this._tokens[pos];
  }
  next() {
    const token = this._tokens[this._pos++];
    token.setFunctionName(this._funcname);
    return token;
  }
  at(type, dx) {
    return this.peek(dx).type === type;
  }
  consume(type) {
    if (this.at(type)) {
      return this.next();
    }
  }
  expect(type) {
    if (!this.at(type)) {
      throw new CompileError(
          "Expected " + type + " but got " + this.peek(), [this.peek()]);
    }
    return this.next();
  }
  parseModule() {
    const token = this.peek();
    const functemps = [];
    const classtemps = [];
    const decltemps = [];
    while (!this.at("EOF")) {
      if (this.at("fn") && this.at("TYPENAME", 1)) {
        const token = this.expect("fn");
        const methodtempl = new SymbolTypeTemplate(token, "Method");
        const typetempl = this.parseTypeTemplate();
        this.expect(openBrace);
        while (!this.consume(closeBrace)) {
          const functemp = this.parseFunctionTemplate();
          functemp.args.unshift(["this", typetempl, true /*isFinal*/]);
          functemp.args.unshift([null, methodtempl]);
          functemps.push(functemp);
        }
      } else if (this.at("static") || this.at("fn")) {
        functemps.push(this.parseFunctionTemplate());
      } else if (this.at("class")) {
        classtemps.push(this.parseClassTemplate());
      } else if (this.at("let") || this.at("final")) {
        decltemps.push(this.parseStatementTemplate());
      } else {
        throw new CompileError(
            "Expected function, class or variable declaration",
            [this.peek()]);
      }
    }
    return {
      "type": "UnexpandedModule",
      "token": token,
      "functemps": functemps,
      "classtemps": classtemps,
      "decltemps": decltemps,
    };
  }
  parseClassTemplate() {
    const token = this.expect("class");
    const isNative = !!this.consume("native");
    const isAbstract = !!this.consume("abstract");
    if (isAbstract && isNative) {
      throw new CompileError(
          "Native classes can't also be abstract", [token]);
    }
    const pattern = this.parseTypeTemplate();
    let attrs = null;
    let nativeAnnotation = null;
    if (isAbstract) {
      this.expect(";");
    } else if (isNative) {
      if (this.at("STRING")) {
        nativeAnnotation = this.expect("STRING").val;
      } else {
        this.expect(";");
      }
    } else {
      attrs = [];
      this.expect(openBrace);
      while (!this.consume(closeBrace)) {
        this.expect("let");
        const name = this.expect("NAME").val;
        const cls = this.parseTypeTemplate();
        this.expect(";");
        attrs.push([name, cls]);
      }
    }
    return {
      "type": "ClassTemplate",
      "token": token,
      "isNative": isNative,
      "isAbstract": isAbstract,
      "pattern": pattern,
      "attrs": attrs,
      "nativeAnnotation": nativeAnnotation,
    };
  }
  parseFunctionTemplate() {
    const token = this.peek();
    const isStatic = !!this.consume("static");
    if (!isStatic) {
      this.expect("fn");
    }
    const isNative = !!this.consume("native");
    const isAsync = !!this.consume("async");
    if (isAsync && (isNative || isStatic)) {
      throw new CompileError(
          "async functions can't be native or static", [token]);
    }
    const name = isStatic ?
        "staticBlock__" + this.getNextStaticBlockId() :
        this.expect("NAME").val;
    this._funcname = name;
    const args = isStatic ? [] : this.parseArgumentsTemplate(true);
    const ret = isStatic ?
        new TypenameTemplate(token, "Void") : this.parseTypeTemplate();
    let body = null;
    const oldInsideAsync = this._insideAsync;
    this._insideAsync = isAsync;
    if (isNative) {
      body = this.expect("STRING").val;
    } else {
      body = this.parseBlockTemplate();
    }
    this._insideAsync = oldInsideAsync;
    this._funcname = null;
    return {
      "type": "FunctionTemplate",
      "token": token,
      "isStatic": isStatic,
      "isNative": isNative,
      "isAsync": isAsync,
      "name": name,
      "args": args,
      "vararg": isStatic ? null : args.vararg,
      "ret": ret,
      "body": body,
    };
  }
  parseArgumentsTemplate(generalizedTypeTemplate) {
    this.expect(openParen);
    const args = [];
    args.vararg = null;
    while (!this.consume(closeParen)) {
      if (this.consume("...")) {
        const name = this.at("NAME") ? this.expect("NAME").val : null;
        const cls = this.expect("TYPENAME").val;
        args.vararg = [name, cls];
        this.expect(closeParen);
        break;
      }
      const isFinal = !!this.consume("final");
      const name = this.at("NAME") ? this.expect("NAME").val : null;
      const cls = generalizedTypeTemplate ?
                  this.parseGeneralTypeTemplate() :
                  this.parseTypeTemplate();
      args.push([name, cls, isFinal]);
      if (!this.at(closeParen)) {
        this.expect(",");
      }
    }
    return args;
  }
  parseGeneralTypeTemplate() {
    return this.parseOrTypeTemplate();
  }
  parseOrTypeTemplate() {
    const token = this.peek();
    let type = this.parseAndTypeTemplate();
    if (this.at("|")) {
      const templates = [type];
      while (this.consume("|")) {
        templates.push(this.parseAndTypeTemplate());
      }
      return new OrTypeTemplate(token, templates);
    }
    return type;
  }
  parseAndTypeTemplate() {
    const token = this.peek();
    let type = this.parsePrimaryTypeTemplate();
    if (this.at("&")) {
      const templates = [type];
      while (this.consume("&")) {
        templates.push(this.parsePrimaryTypeTemplate());
      }
      return new AndTypeTemplate(token, templates);
    }
    return type;
  }
  parsePrimaryTypeTemplate() {
    if (this.consume(openParen)) {
      const ret = this.parseGeneralTypeTemplate();
      this.expect(closeParen);
      return ret;
    } else {
      return this.parseTypeTemplate();
    }
  }
  parseTypeTemplate() {
    const token = this.peek();
    if (this.consume("$")) {
      return new VariableTypeTemplate(token, this.expect("TYPENAME").val);
    }
    if (this.consume(":")) {
      return new SymbolTypeTemplate(
          token,
          (this.consume("NAME") ||
           this.consume("INT") ||
           this.expect("TYPENAME")).val);
    }
    const name = this.expect("TYPENAME").val;
    if (this.consume(openBracket)) {
      const args = [];
      let vararg = null;
      while (!this.consume(closeBracket)) {
        if (this.consume("...")) {
          vararg = this.expect("TYPENAME").val;
          this.expect(closeBracket);
          break;
        }
        args.push(this.parseTypeTemplate());
        if (!this.at(closeBracket)) {
          this.expect(",");
        }
      }
      return new TemplateTypeTemplate(token, name, args, vararg);
    } else {
      return new TypenameTemplate(token, name);
    }
  }
  parseBlockTemplate() {
    const token = this.expect(openBrace);
    const stmts = [];
    while (!this.consume(closeBrace)) {
      stmts.push(this.parseStatementTemplate());
    }
    return {
      "type": "BlockTemplate",
      "token": token,
      "stmts": stmts,
    };
  }
  parseStatementTemplate() {
    const token = this.peek();
    if (this.at(openBrace)) {
      return this.parseBlockTemplate();
    } else if (this.at("let") || this.at("final") || this.at("auto")) {
      const isAuto = !!this.consume("auto");
      const isFinal = isAuto || !!this.consume("final");
      if (!isFinal) {
        this.expect("let");
      }
      const name = this.expect("NAME").val;
      const cls = this.at("=") ? null : this.parseTypeTemplate();
      if (!this.at("=")) {
        throw new CompileError("Variables must be initialized!", [token]);
      }
      this.expect("=");
      const val = this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "DeclarationTemplate",
        "token": token,
        "isAuto": isAuto,
        "isFinal": isFinal,
        "name": name,
        "cls": cls,
        "val": val,
      };
    } else if (this.consume("return")) {
      const expr = this.at(";") ? null : this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "ReturnTemplate",
        "token": token,
        "expr": expr,
      };
    } else if (this.consume("for")) {
      if (this.at("NAME")) {
        const name = this.expect("NAME").val;
        this.expect("in");
        const iter = this.parseExpressionTemplate();
        const body = this.parseBlockTemplate();
        return {
          "type": "ForInTemplate",
          "token": token,
          "name": name,
          "iter": iter,
          "body": body,
        };
      }
      this.expect(openParen);
      const init = this.parseStatementTemplate();
      if (init.type !== "DeclarationTemplate" &&
          init.type !== "ExpressionStatementTemplate") {
        throw new CompileError(
            "The initializer of a for statement must be a declaration or " +
            "an expression", [init.token]);
      }
      if (init.type === "DeclarationTemplate" && init.isAuto) {
        throw new CompileError(
            "The initializer of a for statement cannot be auto",
            [init.token]);
      }
      const cond = this.parseExpressionTemplate();
      this.expect(";");
      const incr = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      return {
        "type": "ForTemplate",
        "token": token,
        "init": init,
        "cond": cond,
        "incr": incr,
        "body": body,
      };
    } else if (this.consume("while")) {
      this.expect(openParen);
      const cond = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      return {
        "type": "WhileTemplate",
        "token": token,
        "cond": cond,
        "body": body,
      };
    } else if (this.consume("break")) {
      this.expect(";");
      return {
        "type": "BreakTemplate",
        "token": token,
      };
    } else if (this.consume("continue")) {
      this.expect(";");
      return {
        "type": "ContinueTemplate",
        "token": token,
      };
    } else if (this.consume("if")) {
      this.expect(openParen);
      const cond = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      let other = null;
      if (this.consume("else")) {
        if (this.at("if")) {
          other = this.parseStatementTemplate();
        } else {
          other = this.parseBlockTemplate();
        }
      }
      return {
        "type": "IfTemplate",
        "token": token,
        "cond": cond,
        "body": body,
        "other": other,
      };
    } else {
      const expr = this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "ExpressionStatementTemplate",
        "token": token,
        "expr": expr,
      };
    }
  }
  parseExpressionListTemplate(open, close) {
    this.expect(open);
    const exprs = [];
    const argkeys = [];
    exprs.varexpr = null;
    while (!this.consume(close)) {
      if (this.consume("...")) {
        if (this.at("NAME")) {
          exprs.varexpr = ["NAME", this.expect("NAME").val];
        } else {
          exprs.varexpr = ["TYPENAME", this.expect("TYPENAME").val];
        }
        this.expect(close);
        break;
      }
      if (this.at("NAME") && this.at(":", 1)) {
        argkeys.push(this.expect("NAME").val);
        this.expect(":");
      } else {
        argkeys.push(null);
      }
      exprs.push(this.parseExpressionTemplate());
      if (!this.at(close)) {
        this.expect(",");
      }
    }
    exprs.argkeys = argkeys;
    return exprs;
  }
  parseExpressionTemplate() {
    return this.parseOrExpressionTemplate();
  }
  parseOrExpressionTemplate() {
    let expr = this.parseAndExpressionTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("||")) {
        expr = {
          "type": "LogicalBinaryOperationTemplate",
          "token": token,
          "op": "||",
          "left": expr,
          "right": this.parseAndExpressionTemplate(),
        };
        continue;
      }
      break;
    }
    return expr;
  }
  parseAndExpressionTemplate() {
    let expr = this.parseRelationalTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("&&")) {
        expr = {
          "type": "LogicalBinaryOperationTemplate",
          "token": token,
          "op": "&&",
          "left": expr,
          "right": this.parseRelationalTemplate(),
        };
        continue;
      }
      break;
    }
    return expr;
  }
  parseRelationalTemplate() {
    const expr = this.parseAdditiveTemplate();
    // NOTE: I don't want relational operators to be "chained" like
    // addition. It's kind of a weird thing to do. If you really need it,
    // use parenthesis.
    const token = this.peek();
    if (this.consume("==")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__eq__", [expr, rhs]);
    }
    if (this.consume("!=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__ne__", [expr, rhs]);
    }
    if (this.consume("<")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__lt__", [expr, rhs]);
    }
    if (this.consume("<=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__le__", [expr, rhs]);
    }
    if (this.consume(">")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__gt__", [expr, rhs]);
    }
    if (this.consume(">=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__ge__", [expr, rhs]);
    }
    if (this.consume("in")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__contains__", [rhs, expr]);
    }
    if (this.consume("not")) {
      this.expect("in");
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__notContains__", [rhs, expr]);
    }
    if (this.consume("is")) {
      if (this.consume("not")) {
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "__isnot__", [expr, rhs]);
      } else {
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "__is__", [expr, rhs]);
      }
    }
    return expr;
  }
  parseAdditiveTemplate() {
    let expr = this.parseMultiplicativeTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("+")) {
        expr = makeFunctionCallTemplate(
            token, "__add__", [expr, this.parseMultiplicativeTemplate()]);
        continue;
      }
      if (this.consume("-")) {
        expr = makeFunctionCallTemplate(
            token, "__sub__", [expr, this.parseMultiplicativeTemplate()]);
        continue;
      }
      break;
    }
    return expr;
  }
  parseMultiplicativeTemplate() {
    let expr = this.parsePrefixTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("*")) {
        expr = makeFunctionCallTemplate(
            token, "__mul__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("/")) {
        expr = makeFunctionCallTemplate(
            token, "__div__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("%")) {
        expr = makeFunctionCallTemplate(
            token, "__mod__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrefixTemplate() {
    const token = this.peek();
    if (this.consume("!")) {
      return makeFunctionCallTemplate(token, "__not__", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("-")) {
      return makeFunctionCallTemplate(token, "__neg__", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("+")) {
      return makeFunctionCallTemplate(token, "__pos__", [
        this.parsePrefixTemplate(),
      ]);
    }
    return this.parsePostfixTemplate();
  }
  parsePostfixTemplate() {
    let expr = this.parsePrimaryTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume(openBracket)) {
        const arg = this.parseExpressionTemplate();
        this.expect(closeBracket);
        if (this.consume("=")) {
          const val = this.parseExpressionTemplate();
          expr = makeFunctionCallTemplate(
              token, "__setitem__", [expr, arg, val]);
        } else {
          expr = makeFunctionCallTemplate(token, "__getitem__", [expr, arg]);
        }
        continue;
      }
      if (this.consume(".")) {
        const name = this.expect("NAME").val;
        if (this.consume("=")) {
          const val = this.parseExpressionTemplate();
          expr = {
            "type": "SetAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
            "val": val,
          };
        } else if (augmentAssignOperands.some(op => this.at(op))) {
          const op = this.next().val;
          const rhs = this.parseExpressionTemplate();
          expr = {
            "type": "AugmentAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
            "op": op,
            "val": rhs,
          };
        } else if (this.at(openParen)) {
          const args =
              this.parseExpressionListTemplate(openParen, closeParen);
          args.unshift(expr);
          args.unshift({
            "type": "TypeExpressionTemplate",
            "token": token,
            "cls": new SymbolTypeTemplate(token, "Method"),
          });
          args.argkeys.unshift(null);
          args.argkeys.unshift(null);
          expr = makeFunctionCallTemplate(token, name, args,
                                          args.varexpr, args.argkeys);
        } else {
          expr = {
            "type": "GetAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
          };
        }
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrimaryTemplate() {
    const token = this.peek();
    if (this.consume("true") || this.consume("false")) {
      return {
        "type": token.type,
        "token": token,
        "exprType": new Typename("Bool"),
      };
    } else if (this.consume("INT")) {
      return {
        "type": "Int",
        "token": token,
        "val": token.val,
        "exprType": new Typename("Int"),
      };
    } else if (this.consume("FLOAT")) {
      return {
        "type": "Float",
        "token": token,
        "val": token.val,
        "exprType": new Typename("Float"),
      };
    } else if (this.consume("STRING")) {
      return {
        "type": "String",
        "token": token,
        "val": token.val,
        "exprType": new Typename("String"),
      };
    } else if (this.consume("NAME")) {
      if (this.at(openParen)) {
        const args = this.parseExpressionListTemplate(openParen, closeParen);
        return makeFunctionCallTemplate(token, token.val, args,
                                        args.varexpr,
                                        args.argkeys);
      } else if (this.consume("=")) {
        const val = this.parseExpressionTemplate();
        return {
          "type": "AssignTemplate",
          "token": token,
          "name": token.val,
          "val": val,
        };
      } else if (augmentAssignOperands.some(op => this.at(op))) {
        const op = this.next().type;
        const rhs = (op === "++" || op === "--") ?
                    null : this.parseExpressionTemplate();
        return {
          "type": "AugmentAssignTemplate",
          "token": token,
          "name": token.val,
          "op": op,
          "val": rhs,
        };
      } else {
        return {
          "type": "NameTemplate",
          "token": token,
          "name": token.val,
        };
      }
    } else if (this.consume("await")) {
      if (!this._insideAsync) {
        throw new CompileError(
            "You can't use await expressions outside of an async " +
            "function or lambda expression", [token]);
      }
      const expr = this.parseExpressionTemplate();
      return {
        "type": "AwaitTemplate",
        "token": token,
        "expr": expr,
      };
    } else if (this.at("$") || this.at(":") || this.at("TYPENAME")) {
      const cls = this.parseTypeTemplate();
      return {
        "type": "TypeExpressionTemplate",
        "token": token,
        "cls": cls,
      };
    } else if (this.consume("fn") || this.consume("async")) {
      const isAsync = token.type === "async";
      const args = this.parseArgumentsTemplate();
      const oldInsideAsync = this._insideAsync;
      this._insideAsync = isAsync;
      const body = this.parseBlockTemplate();
      this._insideAsync = oldInsideAsync;
      for (let i = 0; i < args.length; i++) {
        if (!args[i][0]) {
          throw new CompileError(
              "You can't have a Lambda with type arguments (" + i + ")",
              [token]);
        }
      }
      if (args.vararg && !args.vararg[0]) {
        throw new CompileError(
            "You can't have a Lambda with type arguments (vararg)",
            [token]);
      }
      return {
        "type": "LambdaTemplate",
        "token": token,
        "isAsync": isAsync,
        "args": args,
        "vararg": args.vararg,
        "body": body,
      };
    } else if (this.consume("#")) {
      const op = this.expect("NAME").val;
      switch(op) {
      case "error":{
        const message = this.expect("STRING").val;
        return {
          "type": "CompileTimeErrorTemplate",
          "token": token,
          "message": message,
        };
      }
      default:
        throw new CompileError(
            "Unrecognized compile time operation: " + op, [token]);
      }
    } else if (this.at(openBracket)) {
      const exprs = this.parseExpressionListTemplate(
          openBracket, closeBracket);
      if (exprs.argkeys.some(key => key !== null)) {
        throw new CompileError(
            "List displays can't have keyword arguments", [token]);
      }
      return {
        "type": "ListDisplayTemplate",
        "token": token,
        "exprs": exprs,
        "varexpr": exprs.varexpr,
      };
    } else if (this.consume(openParen)) {
      const expr = this.parseExpressionTemplate();
      this.expect(closeParen);
      return expr;
    }
    throw new CompileError("Expected expression", [token]);
  }
}

function parseModule(uri, text) {
  return new Parser(uri, text).parseModule();
}

function makeFunctionCallTemplate(token, name, exprs, varexpr, argkeys) {
  return {
    "type": "FunctionCallTemplate",
    "token": token,
    "name": name,
    "exprs": exprs,
    "varexpr": varexpr || null,
    "argkeys": argkeys || null,
  };
}

{
  const result = parseModule("<test>", `
  fn main() Void {
    print("Hello world!");
    foo(5);
  }
  fn foo(bar $T) Baz {
    return makeBaz(bar);
  }
  fn native makeBaz(x Int) Baz """ return Object.create(null); """
  `);
}

//// annotator.js

// TODO: Interfaces and Template-interfaces

function serializeFunctionInstantiation(name, argtypes) {
  return name + "(" +
         argtypes.map(argtype => argtype.toString()).join(",") + ")";
}

function checkForDuplicateClassDefinitions(classtemps) {
  const refs = Object.create(null);
  for (const classtemp of classtemps) {
    const key = classtemp.pattern.serialize();
    if (refs[key]) {
      throw new CompileError(
          "Duplicate class definition: " + key,
          [refs[key].token, classtemp.token]);
    }
    refs[key] = classtemp;
  }
}

function checkForDuplicateFunctionDefinitions(functemps) {
  const refs = Object.create(null);
  for (const functemp of functemps) {
    const templ = new TemplateTypeTemplate(
        functemp.token,
        functemp.name,
        functemp.args.map(arg => arg[1]),
        functemp.vararg);
    const key = templ.serialize();
    if (refs[key]) {
      throw new CompileError(
          "Duplicate function definition: " + key,
          [refs[key].token, functemp.token]);
    }
    refs[key] = functemp;
  }
}

function annotate(modules) {
  // collect all the function templates.
  const functemps = [];
  const functempsByName = Object.create(null);
  const classtemps = [];
  const decltemps = [];
  for (const mod of modules) {
    if (mod.type !== "UnexpandedModule") {
      throw new CompileError("Expected Module: " + mod, []);
    }
    for (const functemp of mod.functemps) {
      functemps.push(functemp);
    }
    for (const classtemp of mod.classtemps) {
      classtemps.push(classtemp);
    }
    for (const decltemp of mod.decltemps) {
      decltemps.push(decltemp);
    }
  }

  checkForDuplicateClassDefinitions(classtemps);
  checkForDuplicateFunctionDefinitions(functemps);

  for (const functemp of functemps) {
    if (!functempsByName[functemp.name]) {
      functempsByName[functemp.name] = [];
    }
    functempsByName[functemp.name].push(functemp);
  }

  // expand functions as needed.
  const funcs = [];
  const clss = [];
  const decls = [];
  const instantiationTable = Object.create(null);
  const instantiationQueue = [];  // It's a LIFO queue, shouldn't matter
  const classInstantiationTable = Object.create(null);
  const classInstantiationQueue = [];  // It's a LIFO queue, shouldn't matter

  let currentInstantiationContext = null;

  let scope = Object.create(null);
  const scopeStack = [];

  function pushScope() {
    scopeStack.push(scope);
    scope = Object.create(scope);
  }

  function pushScopeFinalsOnly() {
    scopeStack.push(scope);
    const newScope = Object.create(null);
    for (const key in scope) {
      if (scope[key].isFinal) {
        newScope[key] = scope[key];
      }
    }
    scope = Object.create(newScope);
  }

  function popScope() {
    scope = scopeStack.pop();
  }

  function getVariableType(name, stack) {
    if (!scope[name]) {
      throw new InstantiationError("No such variable " + name, stack);
    }
    return scope[name].type;
  }

  function isVariableFinal(name) {
    return scope[name].isFinal;
  }

  function declareVariable(name, isFinal, type, frames) {
    if (Object.hasOwnProperty.apply(scope, [name])) {
      throw new InstantiationError(
          "Variable " + name + " already declared in scope", frames);
    }
    scope[name] = {"type": type, "isFinal": isFinal};
  }

  function instantiateClass(cls) {
    const key = cls.toString();
    const classtemp = findMatchingClassTemplate(cls);
    if (classtemp === null) {
      throw new CompileError("No such class " + key, []);
    }
    const token = classtemp.token;
    const bindings = classtemp.pattern.bindType(cls);
    let attrs = null;
    if (!classtemp.isNative && !classtemp.isAbstract) {
      attrs = [];
      for (const [name, typeTemplate] of classtemp.attrs) {
        // NOTE: This causes the resulting type to get queued
        // for instantiation.
        attrs.push([name, resolveTypeTemplate(typeTemplate, bindings)]);
      }
    }
    return {
      "type": "Class",
      "token": token,
      "isNative": classtemp.isNative,
      "isAbstract": classtemp.isAbstract,
      "pattern": cls,
      "template": classtemp,
      "bindings": bindings,
      "attrs": attrs,
      "nativeAnnotation": classtemp.nativeAnnotation,
    };
  }

  function instantiateFunction(name, argtypes, stack) {
    const functemp = findMatchingFunctionTemplate(name, argtypes);
    if (functemp === null) {
      throw new InstantiationError(
          "No such function: " +
          serializeFunctionInstantiation(name, argtypes),
          flatten(stack));
    }
    const token = functemp.token;
    currentInstantiationContext =
        serializeFunctionInstantiation(name, argtypes);
    const frame = new InstantiationFrame(token, currentInstantiationContext);
    const bindings = bindFunctionTemplateWithArgumentTypes(
        functemp, argtypes);
    const bodyret = resolveTypeTemplate(functemp.ret, bindings);
    const isAsync = functemp.isAsync;
    const ret = isAsync ? new TemplateType("Promise", [bodyret]) : bodyret;
    queueClassInstantiation(ret);
    const argnames = functemp.args.map(targ => targ[0]);
    const args = [];
    for (let i = 0; i < argnames.length; i++) {
      args.push([argnames[i], argtypes[i], functemp.args[i][2]]);
    }
    if (functemp.vararg) {
      const varargname = functemp.vararg[0];
      for (let i = argnames.length; i < argtypes.length; i++) {
        const j = i - argnames.length;
        if (varargname === null) {
          args.push([null, argtypes[i]]);
        } else {
          args.push([varargname + "__" + j, argtypes[i]]);
        }
      }
    }
    if (functemp.isNative) {
      currentInstantiationContext = null;
      return {
        "type": "Function",
        "token": token,
        "isStatic": functemp.isStatic,
        "isNative": functemp.isNative,
        "isAsync": isAsync,
        "name": functemp.name,
        "args": args,
        "ret": ret,
        "body": functemp.body,
      };
    }
    pushScope();
    for (let i = 0; i < argnames.length; i++) {
      const argname = argnames[i];
      if (argname !== null) {
        declareVariable(
            argnames[i],
            args[i][2] /* isFinal */,
            args[i][1], [frame].concat(flatten(stack)));
      }
    }
    if (functemp.vararg) {
      const varargname = functemp.vararg[0];
      const types = [];
      for (let i = argnames.length; i < argtypes.length; i++) {
        types.push(argtypes[i]);
      }
      declareVariable("..." + varargname, false, types,
                      [frame].concat(flatten(stack)));
    }

    const body = resolveStatement(functemp.body, bindings, stack);
    currentInstantiationContext = null;
    popScope();
    if (bodyret.equals(newTypename("Void"))) {
      if (body.maybeReturns !== null &&
          !body.maybeReturns.equals(newTypename("Void"))) {
        throw new InstantiationError(
            "Void function might return a value",
            [frame].concat(flatten(stack)));
      }
    } else {
      if (body.returns === null) {
        throw new InstantiationError(
            "Function might not return",
            [frame].concat(flatten(stack)));
      } else if (!body.maybeReturns.equals(bodyret)) {
        throw new InstantiationError(
            "Expected " + bodyret.toString() + " return type, but got " +
            body.maybeReturns.toString(),
            [frame].concat(flatten(stack)));
      }
    }
    return {
      "type": "Function",
      "token": token,
      "isStatic": functemp.isStatic,
      "isNative": functemp.isNative,
      "isAsync": isAsync,
      "name": functemp.name,
      "args": args,
      "ret": ret,
      "body": body,
    };
  }

  function flatten(stack, result) {
    result = result || [];
    if (stack === null) {
      return result;
    } else {
      result.push(stack[0]);
      flatten(stack[1], result);
      return result;
    }
  }

  function resolveStatement(node, bindings, stack) {
    switch(node.type) {
    case "BlockTemplate":
      pushScope();
      const stmts = node.stmts.map(stmt =>
          resolveStatement(stmt, bindings, stack));
      popScope();
      let ret = null;
      let mret = null;
      for (const stmt of stmts) {
        const frame = new InstantiationFrame(
            stmt.token, currentInstantiationContext);
        if (ret !== null) {
          throw new InstantiationError(
              "Unreachable statement",
              [frame].concat(flatten(stack)));
        }
        if (stmt.returns !== null) {
          if (mret !== null && !stmt.returns.equals(mret)) {
            throw new InstantiationError(
                "Mismatch return types: " + mret.toString() + " and " +
                stmt.returns.toString(),
                [frame].concat(flatten(stack)));
          }
          mret = ret = stmt.returns;
        }
        if (stmt.maybeReturns !== null) {
          if (mret === null) {
            mret = stmt.maybeReturns;
          } else if (!stmt.maybeReturns.equals(mret)) {
            throw new InstantiationError(
                "Mismatch return types: " + mret.toString() + " and " +
                stmt.maybeReturns.toString(),
                [frame].concat(flatten(stack)));
          }
        }
      }
      return {
        "type": "Block",
        "token": node.token,
        "stmts": stmts,
        "returns": ret,
        "maybeReturns": mret,
      };
    case "DeclarationTemplate":
      const val = resolveExpression(node.val, bindings, stack);
      const cls = node.cls === null ?
          val.exprType : resolveTypeTemplate(node.cls, bindings);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!val.exprType.equals(cls)) {
        throw new InstantiationError(
            "Expected " + cls.toString() + " but got an expression of " +
            "type " + val.toString(), [frame].concat(flatten(stack)));
      }
      if (node.isAuto) {
        // Instantiate the delete function for this variable so that
        // it is available for the code generator to use.
        queueFunctionInstantiation("delete", [cls], [frame, stack]);
      }
      declareVariable(
          node.name, node.isFinal, cls, [frame].concat(flatten(stack)));
      return {
        "type": "Declaration",
        "token": node.token,
        "isAuto": node.isAuto,
        "isFinal": node.isFinal,
        "name": node.name,
        "cls": cls,
        "val": val,
        "returns": null,
        "maybeReturns": null,
      };
    case "ExpressionStatementTemplate":
      return {
        "type": "ExpressionStatement",
        "token": node.token,
        "expr": resolveExpression(node.expr, bindings, stack),
        "returns": null,
        "maybeReturns": null,
      };
    case "ReturnTemplate":
      const expr = node.expr === null ?
          null : resolveExpression(node.expr, bindings, stack);
      const rettype = expr === null ? newTypename("Void") : expr.exprType;
      return {
        "type": "Return",
        "token": node.token,
        "expr": expr,
        "returns": rettype,
        "maybeReturns": rettype,
      };
    case "ForTemplate": {
      pushScope();
      const init = node.init === null ?
                   null : resolveStatement(node.init, bindings, stack);
      const cond = node.init === null ?
                   null : resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "For loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const incr = node.incr === null ?
                   null : resolveExpression(node.incr, bindings, stack);
      const body = resolveStatement(node.body, bindings, stack);
      popScope();
      return {
        "type": "For",
        "token": node.token,
        "init": init,
        "cond": cond,
        "incr": incr,
        "body": body,
        "returns": null,
        "maybeReturns": body.maybeReturns,
      };
    }
    case "ForInTemplate": {
      return resolveStatement({
        "type": "ForTemplate",
        "token": node.token,
        "init": {
          "type": "DeclarationTemplate",
          "token": node.token,
          "isAuto": false,
          "isFinal": false,
          "name": "__iter",
          "cls": null,
          "val": makeFunctionCallTemplate(node.token, "iter", [
              node.iter,
          ]),
        },
        "cond": makeFunctionCallTemplate(node.token, "hasNext", [{
          "type": "NameTemplate",
          "token": node.token,
          "name": "__iter",
        }]),
        "incr": null,
        "body": {
          "type": "BlockTemplate",
          "token": node.token,
          "stmts": [
            {
              "type": "DeclarationTemplate",
              "token": node.token,
              "isAuto": false,
              "isFinal": false,
              "name": node.name,
              "cls": null,
              "val": makeFunctionCallTemplate(node.token, "next", [{
                "type": "NameTemplate",
                "token": node.token,
                "name": "__iter",
              }]),
            },
            node.body,
          ],
        },
      }, bindings, stack);
    }
    case "WhileTemplate": {
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "While loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const body = resolveStatement(node.body, bindings, stack);
      return {
        "type": "While",
        "token": node.token,
        "cond": cond,
        "body": body,
        "returns": null,
        "maybeReturns": body.maybeReturns,
      };
    }
    case "BreakTemplate":
      return {
        "type": "Break",
        "token": node.token,
        "returns": null,
        "maybeReturns": null,
      };
    case "ContinueTemplate":
      return {
        "type": "Continue",
        "token": node.token,
        "returns": null,
        "maybeReturns": null,
      };
    case "IfTemplate": {
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "For loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const body = resolveStatement(node.body, bindings, stack);
      const other = node.other === null ?
          null : resolveStatement(node.other, bindings, stack);
      if (other !== null && other.maybeReturns !== null &&
          body.maybeReturns !== null &&
          !body.maybeReturns.equals(other.maybeReturns)) {
        throw new InstantiationError(
            "Return type mismatch", [frame].concat(flatten(stack)));
      }
      let returns = null;
      if (other !== null && other.returns !== null &&
          body.returns !== null) {
        returns = body.returns;
      }
      let maybeReturns = null;
      if (other !== null && other.maybeReturns !== null) {
        maybeReturns = other.maybeReturns;
      }
      if (body.maybeReturns !== null) {
        maybeReturns = body.maybeReturns;
      }
      return {
        "type": "If",
        "token": node.token,
        "cond": cond,
        "body": body,
        "other": other,
        "returns": returns,
        "maybeReturns": maybeReturns,
      };
    }
    default:
      throw new CompileError(
          "Unrecognized statement template: " + node.type,
          [node.token]);
    }
  }

  function resolveExpression(node, bindings, stack) {
    const result = resolveValueOrTypeExpression(node, bindings, stack);
    const frame = new InstantiationFrame(
        node.token, currentInstantiationContext);
    if (result.type === "TypeExpression") {
      throw new InstantiationError(
          "Expected expression but got type expression",
          [frame].concat(flatten(stack)));
    }
    return result;
  }

  function resolveExpressionList(node, bindings, stack) {
    const exprs = node.exprs;
    const varexpr = node.varexpr;
    const token = node.token;
    const result = [];
    for (const expr of exprs) {
      result.push(resolveValueOrTypeExpression(expr, bindings, stack));
    }
    if (varexpr !== null) {
      const [kind, name] = varexpr;
      switch(kind) {
      case "NAME": {
        const types = getVariableType("..." + name);
        for (let i = 0; i < types.length; i++) {
          result.push({
            "type": "Name",
            "token": token,
            "name": name + "__" + i,
            "exprType": types[i],
          });
        }
        break;
      }
      case "TYPENAME": {
        const types = bindings["..." + name];
        if (!types) {
          throw new InstantiationError(
              "No such varexpr type: ..." + name,
              flatten(stack));
        }
        for (const type of types) {
          result.push({
            "type": "TypeExpression",
            "token": token,
            "exprType": type,
          });
        }
        break;
      }
      default:
        throw new InstantiationError(
            "Unrecognized varexpr kind: " + kind,
            flatten(stack));
      }
    }
    return result;
  }

  function isValidMallocArgtypes(argtypes, args, frame, stack) {
    if (argtypes.length === 0) {
      return false;
    }
    const type = argtypes[0];
    if (type instanceof SymbolType) {
      return false;
    }
    const classtemp = findMatchingClassTemplate(type);
    if (classtemp === null) {
      return false;
    }
    if (classtemp.isNative || classtemp.isAbstract) {
      return false;
    }
    if (argtypes.length-1 !== classtemp.attrs.length) {
      return false;
    }
    const cls = instantiateClass(type);
    for (let i = 0; i < argtypes.length-1; i++) {
      const actualType = argtypes[i+1];
      const expectedType = cls.attrs[i][1];
      if (!actualType.equals(expectedType)) {
        return false;
      }
      if (isTypeExpression(args[i+1])) {
        throw new InstantiationError(
            "Expected value expression for " + (i+1) + " argument, " +
            "but got type expression",
            [frame].concat(flatten(stack)));
      }
    }
    return cls;
  }

  function isTypeExpression(node) {
    return node.type === "TypeExpression";
  }

  function resolveValueOrTypeExpression(node, bindings, stack) {
    const frame =
        new InstantiationFrame(node.token, currentInstantiationContext);
    switch(node.type) {
    case "FunctionCallTemplate":
      const name = node.name;
      const args = resolveExpressionList(node, bindings, stack);
      const argtypes = args.map(arg => arg.exprType);
      const argkeys = node.argkeys;

      if (argkeys !== null) {
        while (argkeys.length < args.length) {
          argkeys.push(null);
        }
      }

      // HACK: If I had more mature meta-programming facilities, I could
      // cleanly implement malloc in the language itself as native
      // function.
      if (name === "malloc") {
        const cls = isValidMallocArgtypes(argtypes, args, frame, stack);
        if (cls) {
          const functemp = findMatchingFunctionTemplate(name, argtypes);
          if (functemp) {
            throw new InstantiationError(
                "User defined malloc function shadows the builtin malloc" +
                functemp.token.getLocationMessage(),
                [frame].concat(flatten(stack)));
          }
          args.shift();
          return {
            "type": "Malloc",
            "token": node.token,
            "args": args,
            "attrnames": cls.attrs.map(attr => attr[0]),
            "exprType": argtypes[0],
          };
        }
      }
      const rettype = getFunctionReturnType(
          name, argtypes, [frame].concat(flatten(stack)));
      queueFunctionInstantiation(name, argtypes, [frame, stack]);
      // TODO: Figure out if I want type expression arguments to
      // fundamentally have different type signatures from runtime
      // expression arguments.
      // NOTE: This functemp should not be null since if it were,
      // "rettype = getFunctionReturnType(...)" should've thrown

      // TODO: Use a more reobust way to test whether an expression
      // is a type expression than just checking if it is the
      // "TypeExpression" node.

      // NOTE: We check that we don't use type expressions when we
      // expect a value, but we don't check vice versa.
      // Somteimes we want to use a value expression to represent
      // the type we want to pass.

      const functemp = findMatchingFunctionTemplate(name, argtypes);
      for (let i = 0; i < functemp.args.length; i++) {
        if (args[i].type === "TypeExpression") {
          if (functemp.args[i][0] !== null) {
            throw new InstantiationError(
                "Expected value expression but got type expression: " +
                "argumentIndex = " + i +
                functemp.token.getLocationMessage(),
                [frame].concat(flatten(stack)));
          }
        }
        if (argkeys !== null && argkeys[i] !== null &&
            argkeys[i] !== functemp.args[i][0]) {
          throw new InstantiationError(
              "Keyword argument mismatch, expected '" + functemp.args[i][0] +
              "' but got '" + argkeys[i] + "' " +
              functemp.token.getLocationMessage(),
              [frame].concat(flatten(stack)));
        }
      }

      if (functemp.vararg) {
        // Here we check that if the vararg argument signature indicates
        // a value expression, we make sure that we get a type expression.
        const [name, type] = functemp.vararg;
        if (name) {
          for (let i = functemp.args.length; i < args.length; i++) {
            if (isTypeExpression(args[i])) {
              throw new InstantiationError(
                  "Expected value expressions for vararg part, but got " +
                  "type expression: argumentIndex = " + i +
                  functemp.token.getLocationMessage(),
                  [frame].concat(flatten(stack)));
            }
          }
        }
      }
      return {
        "type": "FunctionCall",
        "token": node.token,
        "name": name,
        "args": args,
        "exprType": rettype,
      };
    case "NameTemplate":
      return {
        "type": "Name",
        "token": node.token,
        "name": node.name,
        "exprType": getVariableType(
            node.name, [frame].concat(flatten(stack))),
      };
    case "true":
    case "false":
    case "Int":
    case "Float":
    case "String":
      queueClassInstantiation(node.exprType);
      return node;
    case "GetAttributeTemplate": {
      const owner = resolveExpression(node.owner, bindings, stack);
      const type = getAttributeTypeOrNull(owner.exprType, node.name);
      if (type === null) {
        return resolveExpression(makeFunctionCallTemplate(
          node.token, "getattr", [
            node.owner,
            {
              "type": "TypeExpressionTemplate",
              "token": node.token,
              "cls": new SymbolTypeTemplate(node.token, node.name),
            },
          ]
        ), bindings, stack);
      }
      return {
        "type": "GetAttribute",
        "token": node.token,
        "owner": owner,
        "name": node.name,
        "exprType": type,
      };
    }
    case "SetAttributeTemplate": {
      const owner = resolveExpression(node.owner, bindings, stack);
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getAttributeTypeOrNull(owner.exprType, node.name);
      if (exprType === null) {
        return resolveExpression(makeFunctionCallTemplate(
          node.token, "setattr", [
            node.owner,
            {
              "type": "TypeExpressionTemplate",
              "token": node.token,
              "cls": new SymbolTypeTemplate(node.token, node.name),
            },
            node.val,
          ]
        ), bindings, stack);
      }
      if (!exprType.equals(val.exprType)) {
        throw new InstantiationError(
            owner.exprType + "." + node.name + " is type " + exprType +
            " but expression is of type " + val.exprType,
            [frame].concat(flatten(stack)));
      }
      return {
        "type": "SetAttribute",
        "token": node.token,
        "owner": owner,
        "name": node.name,
        "val": val,
        "exprType": exprType,
      };
    }
    case "TypeExpressionTemplate":
      const cls = resolveTypeTemplate(node.cls, bindings);
      return {
        "type": "TypeExpression",
        "token": node.token,
        "exprType": cls,
      };
    case "CompileTimeErrorTemplate":
      throw new InstantiationError(
          node.message, [frame].concat(flatten(stack)));
    case "ListDisplayTemplate": {
      const exprs = resolveExpressionList(node, bindings, stack);
      if (exprs.length === 0) {
        throw new InstantiationError(
          "List displays must contain at least one element to allow for " +
          "type inference -- try e.g. new(List[Int]) instead",
          [frame].concat(flatten(stack)));
      }
      for (const expr of exprs) {
        if (!expr.exprType.equals(exprs[0].exprType)) {
          const frame = new InstantiationFrame(
              expr.token, currentInstantiationContext);
          throw new InstantiationError(
            "Expected " + exprs[0].exprType.toString() + " but got " +
            expr.exprType.toString(), [frame].concat(flatten(stack)));
        }
        if (expr.type === "TypeExpression") {
          throw new InstantiationError(
              "Expected expression but got type expression",
              [frame].concat(flatten(stack)));
        }
      }
      const exprType = new TemplateType("List", [exprs[0].exprType]);
      queueClassInstantiation(exprType);
      return {
        "type": "ListDisplay",
        "token": node.token,
        "exprs": exprs,
        "exprType": exprType,
      };
    }
    case "AssignTemplate":
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getVariableType(
          node.name, [frame].concat(flatten(stack)));
      if (isVariableFinal(node.name)) {
        throw new InstantiationError(
            "Tried to assign to final variable '" + node.name + "'",
            [frame].concat(flatten(stack)));
      }
      if (!val.exprType.equals(exprType)) {
        throw new InstantiationError(
            "Variable is type " + exprType.toString() + " but " +
            "expression is of type " + val.exprType.toString(),
            [frame].concat(flatten(stack)));
      }
      return {
        "type": "Assign",
        "token": node.token,
        "name": node.name,
        "val": val,
        "exprType": exprType,
      };
    case "AugmentAssignTemplate": {
      const exprType = getVariableType(node.name, stack);
      if (isVariableFinal(node.name)) {
        throw new InstantiationError(
            "You can't Augassign a final variable '" + node.name + "'",
            [frame].concat(flatten(stack)));
      }
      if (!(exprType instanceof Typename) ||
          (exprType.name !== "Int" && exprType.name !== "Float" &&
           exprType.name !== "String")) {
        throw new InstantiationError(
            "Augassign operations can only be done on int or float " +
            "variables: " + exprType.toString(),
            [frame].concat(flatten(stack)));
      }
      if (exprType.name === "String" && node.op !== "+=") {
        throw new InstantiationError(
            "Only the += augassign operation can be used on String types",
            [frame].concat(flatten(stack)));
      }
      if ((node.op === "++" || node.op === "--") && exprType.name !== "Int") {
        throw new InstantiationError(
            "++ and -- operators can only be used on Int types " +
            "but found: " + exprType.name,
            [frame].concat(flatten(stack)));
      }
      const val = node.val === null ?
                  null : resolveExpression(node.val, bindings, stack);
      if (val !== null && !val.exprType.equals(exprType)) {
        throw new InstantiationError(
            "Expected " + exprType.toString() + " but got " +
            val.exprType.toString(), [frame].concat(flatten(stack)));
      }
      return {
        "type": "AugmentAssign",
        "token": node.token,
        "name": node.name,
        "op": node.op,
        "val": val,
        "exprType": exprType,
      };
    }
    case "LogicalBinaryOperationTemplate": {
      const left = resolveExpression(node.left, bindings, stack);
      const right = resolveExpression(node.right, bindings, stack);
      const frames = [frame].concat(flatten(stack));
      if (!left.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "Or (left) operand must be Bool but got " + left.exprType,
            frames);
      }
      if (!right.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "Or (right) operand must be Bool but got " + right.exprType,
            frames);
      }
      return {
        "type": "LogicalBinaryOperation",
        "token": node.token,
        "op": node.op,
        "left": left,
        "right": right,
        "exprType": newTypename("Bool"),
      };
    }
    case "AwaitTemplate": {
      const expr = resolveExpression(node.expr, bindings, stack);
      if (!(expr.exprType instanceof TemplateType) ||
          expr.exprType.name !== "Promise" ||
          expr.exprType.args.length !== 1) {
        throw new InstantiationError(
            "You can only await on an object of type Promise[$T], " +
            "but got: " + expr.exprType,
          [frame].concat(flatten(stack)));
      }
      const exprType = expr.exprType.args[0];
      return {
        "type":  "Await",
        "token": node.token,
        "expr": expr,
        "exprType": exprType,
      };
    }
    case "LambdaTemplate": {
      const args = [];
      pushScopeFinalsOnly();
      for (const [argname, argtypetemp, isFinal] of node.args) {
        const argtype = resolveTypeTemplate(argtypetemp, bindings);
        args.push([argname, argtype]);
        declareVariable(
          argname, isFinal, argtype, [frame].concat(flatten(stack)));
      }
      if (node.vararg) {
        const [name, typename] = node.vararg;
        if (!bindings["..." + typename]) {
          throw new InstantiationError(
              "Tried to use vararg type ..." + typename + " in Lambda " +
              "argument list, but there is no such vararg type",
              [frame].concat(flatten(stack)));
        }
        const types = bindings["..." + typename];
        for (let i = 0; i < types.length; i++) {
          const key = name + "__" + i;
          args.push([key, types[i]]);
          declareVariable(key, true, types[i],
                          [frame].concat(flatten(stack)));
        }
        declareVariable(
            "..." + name, false, types, [frame].concat(flatten(stack)));
      }
      const argtypes = args.map(arg => arg[1]);
      const body = resolveStatement(node.body, bindings, stack);
      if (body.maybeReturns !== null && body.returns === null) {
        throw new InstantiationError(
            "Invalid return types: " + body.maybeReturns + " / " +
            body.returns, [frame].concat(flatten(stack)));
      }
      if (body.returns === null) {
        body.returns = newTypename("Void");
      }
      popScope();
      const bodyret = node.isAsync ?
                      new TemplateType("Promise", [body.returns]) :
                      body.returns;
      const exprType = new TemplateType("Lambda", [bodyret].concat(argtypes));
      queueClassInstantiation(exprType);
      return {
        "type": "Lambda",
        "token": node.token,
        "isAsync": node.isAsync,
        "args": args,
        "body": body,
        "exprType": exprType,
      };
    }
    default:
      throw new InstantiationError(
          "Unrecognized expression template: " + node.type, [frame]);
    }
  }

  function getFunctionReturnType(name, argtypes, frames) {
    const functemp = findMatchingFunctionTemplate(name, argtypes);
    if (functemp === null) {
      throw new InstantiationError(
          "No such function: " +
          serializeFunctionInstantiation(name, argtypes),
          frames);
    }
    const bindings = bindFunctionTemplateWithArgumentTypes(
        functemp, argtypes);
    const ret = functemp.isAsync ?
        new TemplateTypeTemplate(functemp.token, "Promise", [functemp.ret]):
        functemp.ret;
    return resolveTypeTemplate(ret, bindings);
  }

  function getAttributeTypeOrNull(type, name) {
    const cls = instantiateClass(type);
    if (cls === null || cls.attrs === null) {
      return null;
    }
    for (const [n, t] of cls.attrs) {
      if (name === n) {
        return t;
      }
    }
    return null;
  }

  function getAttributeType(type, name, frame, stack) {
    const ret = getAttributeTypeOrNull(type, name);
    if (ret === null) {
      throw new InstantiationError(
          "No such attribute: " + type + "." + name,
          [frame].concat(flatten(stack)));
    }
    return ret;
  }

  function resolveTypeTemplate(typeTemplate, bindings) {
    const type = typeTemplate.resolve(bindings);
    queueClassInstantiation(type);
    return type;
  }

  const matchingFunctionTemplateCache = Object.create(null);
  function findMatchingFunctionTemplate(name, argtypes) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (matchingFunctionTemplateCache[key] === undefined) {
      let bestSoFar = null;
      for (const functemp of (functempsByName[name] || [])) {
        const bindings = bindFunctionTemplateWithArgumentTypes(
            functemp, argtypes);
        if (bindings === null) {
          continue;
        }
        if (bestSoFar !== null &&
            !isMoreSpecializedFunctionTemplate(functemp, bestSoFar)) {
          continue;
        }
        bestSoFar = functemp;
      }
      matchingFunctionTemplateCache[key] = bestSoFar;
    }
    return matchingFunctionTemplateCache[key];
  }

  const matchingClassTemplateCache = Object.create(null);
  function findMatchingClassTemplate(cls) {
    const key = cls.toString();
    if (matchingClassTemplateCache[key] === undefined) {
      let bestSoFar = null;
      for (const classtemp of classtemps) {
        const bindings = classtemp.pattern.bindType(cls);
        if (bindings === null) {
          continue;
        }
        if (bestSoFar !== null &&
            classtemp.pattern.compareSpecialization(bestSoFar.pattern) < 0) {
          continue;
        }
        bestSoFar = classtemp;
      }
      matchingClassTemplateCache[key] = bestSoFar;
    }
    return matchingClassTemplateCache[key];
  }

  function isMoreSpecializedFunctionTemplate(left, right) {
    // returns true if the 'left' function template is more specialized
    // than the right one.
    const lefttemp = typeTemplateFromFunctionTemplate(left);
    const righttemp = typeTemplateFromFunctionTemplate(right);
    return lefttemp.compareSpecialization(righttemp) > 0;
  }

  function typeTemplateFromFunctionTemplate(functemp) {
    const argtypes = functemp.args.map(arg => arg[1]);
    const vararg = functemp.vararg ? functemp.vararg[1] : null;
    return new TemplateTypeTemplate(functemp.token, "Args", argtypes, vararg);
  }

  function bindFunctionTemplateWithArgumentTypes(functemp, argtypes) {
    const typeTemplate = typeTemplateFromFunctionTemplate(functemp);
    return typeTemplate.bindType(new TemplateType("Args", argtypes));
  }

  function queueFunctionInstantiation(name, argtypes, stack) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!instantiationTable[key]) {
      instantiationTable[key] = true;
      instantiationQueue.push([name, argtypes, stack]);
    }
  }

  function queueClassInstantiation(cls) {
    if (cls instanceof SymbolType) {
      return;
    }
    const key = cls.toString();
    if (!classInstantiationTable[key]) {
      classInstantiationTable[key] = true;
      classInstantiationQueue.push(cls);

      // With template types, we also want to check all child
      // types have been instantiated.
      if (cls instanceof TemplateType) {
        for (const child of cls.args) {
          queueClassInstantiation(child);
        }
      }
    }
  }

  function newTypename(name) {
    const type = new Typename(name);
    queueClassInstantiation(type);
    return type;
  }

  // Queue all static blocks for instantiation
  for (const decltemp of decltemps) {
    decls.push(resolveStatement(decltemp, Object.create(null), null));
  }
  for (const functemp of functemps) {
    if (functemp.isStatic) {
      instantiationQueue.push([functemp.name, [], null]);
    }
  }
  // Queue main for instantiation
  instantiationQueue.push(["main", [], null]);

  while (true) {
    if (instantiationQueue.length > 0) {
      const [name, argtypes, stack] = instantiationQueue.shift();
      funcs.push(instantiateFunction(name, argtypes, stack));
      continue;
    }
    if (classInstantiationQueue.length > 0) {
      const cls = classInstantiationQueue.shift();
      clss.push(instantiateClass(cls));
      continue;
    }
    break;
  }

  return {
    "type": "Program",
    "funcs": funcs,
    "clss": clss,
    "decls": decls,
  };
}

{
  const result = parseModule("<test>", `
  fn main() Void {
    print("Hello world!");
    foo(5);
  }
  fn foo(bar $T) Baz {
    return makeBaz(bar);
  }

  fn native makeBaz(x Int) Baz """
    return Object.create(null);
  """

  fn native print(t $T) Void """
    console.log(var_t);
  """

  class native Baz;
  class native Void;
  class native String;
  class native Int;
  class Baz2 [$T] {
    let t $T;
  }
  `);
  const ast = annotate([result]);
}

function parseAndAnnotate(uriTextPairs, printCompileTimes) {
  const mods = [];
  const parseStart = Date.now();
  for (const [uri, text] of uriTextPairs) {
    mods.push(parseModule(uri, text));
  }
  if (printCompileTimes) {
    console.error("Parsing took: " + (Date.now()-parseStart) + "ms");
  }
  const start = Date.now();
  const result = annotate(mods);
  if (printCompileTimes) {
    console.error("Annotating took: " + (Date.now()-parseStart) + "ms");
  }
  return result;
}

//// ttutils.js

function sanitizeString(str) {
  let r = "";
  let i = 0;
  while (i < str.length) {
    switch(str[i]) {
    case "\\": r += "\\\\"; break;
    case "\"": r += "\\\""; break;
    case "\'": r += "\\\'"; break;
    case "\n": r += "\\n"; break;
    case "\r": r += "\\r"; break;
    case "\t": r += "\\t"; break;
    default: r += str[i];
    }
    i++;
  }
  return r;
}


//// genjs.js

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

function compile(uriTextPairs, printCompileTimes) {
  const compiler = new Compiler(uriTextPairs, printCompileTimes);
  const start = Date.now();
  const result = compiler.compile();
  if (printCompileTimes) {
    console.error("Code generation took: " + (Date.now()-start) + "ms");
  }
  return result;
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
  constructor(uriTextPairs, printCompileTimes) {
    this._uriTextPairs = uriTextPairs;
    this._nextId = 1;
    this._nameCache = Object.create(null);
    this._tagCache = Object.create(null);
    this._tagList = [];
    this._program = parseAndAnnotate(this._uriTextPairs, printCompileTimes);
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
      s += this.compileNativeAnnotationOf(cls);
    } else {
      s += "*";
    }
    s += "}";
    s += "\n */";
    s += "\nvar " + name + ";";
    return s;
  }
  compileNativeAnnotationOf(cls) {
    let ann = cls.nativeAnnotation;
    const bindings = Object.create(cls.bindings);
    bindings.Self = cls.pattern;
    const keys = Object.keys(cls.bindings).concat(Object.keys(bindings));
    for (let key of keys) {
      const rawKey = key;
      if (key.startsWith("...")) {
        key = "\\.\\.\\." + key.slice(3);
      } else {
        key = "\\$" + key;
      }
      key += "\\b";
      let val = bindings[rawKey];
      if (rawKey.startsWith("...")) {
        val = val.map(t => this.getClassNameFromType(t)).join(",");
        if (val.length > 0) {
          val = ", " + val;
        }
      } else {
        val = this.getClassNameFromType(val);
      }
      ann = ann.replace(new RegExp(key, 'mg'), val);
    }
    return ann;
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
      return '"' + sanitizeString(node.val) + '"';
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

//// exports

const exports = Object.create(null);

exports.asyncf = asyncf;
exports.compile = compile;

return exports;

})();

if (typeof module !== 'undefined' && module.exports) {
  // Let's say this means that we're in node.js.
  // http://stackoverflow.com/questions/4224606
  // says Underscore uses something like this to detect browser/node.js
  module.exports = tt;
}
