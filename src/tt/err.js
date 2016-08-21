// err.js

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

exports.Source = Source;
exports.CompileError = CompileError;
exports.InstantiationError = InstantiationError;
exports.InstantiationFrame = InstantiationFrame;
exports.Token = Token;
exports.assertEqual = assertEqual;

