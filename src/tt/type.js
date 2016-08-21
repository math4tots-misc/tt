// type.js

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

exports.Type = Type;
exports.Typename = Typename;
exports.SymbolType = SymbolType;
exports.TemplateType = TemplateType;

