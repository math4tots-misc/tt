class TranspileError extends Error {}

class AssertError extends TranspileError {}

class ParseError extends TranspileError {
  constructor(message, tokens) {
    super(message + tokens.map(token => token.getLocationMessage()).join(""));
  }
}

class InstantiationError extends TranspileError {
  constructor(message, frames) {
    const frameMessages = frames.map(frame => frame.getFrameMessage());
    super(message + frameMessages.join("").replace(/\n/g, "\n  "));
  }
}

function assertEqual(left, right) {
  if (left !== right) {
    throw new AssertError(
        "assertEqual failed: left = " + left + ", right = " + right);
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
      throw new AssertError("No function name for " + this);
    }
    return this.funcname;
  }
  setFunctionName(name) {
    if (this.funcnameset) {
      throw new AssertError("Function name already set for " + this);
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

exports.TranspileError = TranspileError;
exports.AssertError = AssertError;
exports.ParseError = ParseError;
exports.InstantiationError = InstantiationError;
exports.assertEqual = assertEqual;
exports.Source = Source;
exports.Token = Token;
exports.InstantiationFrame = InstantiationFrame;
