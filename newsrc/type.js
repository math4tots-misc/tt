class Type {
  equals(other) {
    return this.toString() === other.toString();
  }
}

class Typename extends Type {
  constructor(name) {
    super();
    this.name = name;
  }
  toString() {
    return this.name;
  }
  inspect() {
    return "Typename(" + this.name + ")";
  }
}

class TemplateType extends Type {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
    this._str = name + "[" + args.map(arg => arg.toString()).join(",") + "]";
  }
  toString() {
    return this._str;
  }
  inspect() {
    return "TemplateType(" + this.name + ", [" +
           this.args.map(arg => arg.toString()).join(", ") + "])";
  }
}

exports.Type = Type;
exports.Typename = Typename;
exports.TemplateType = TemplateType;
