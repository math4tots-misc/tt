const type = require("./type.js");

class TypeTemplate {
  constructor(token) {
    this.token = token;
  }
}

class TypenameTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;  // TYPENAME
  }
}

class TemplateTypeTemplate extends TypeTemplate {
  constructor(token, name, args, vararg) {
    super(token);
    this.name = name;  // TYPENAME
    this.args = args;  // [TypeTemplate]
    this.vararg = vararg || null;  // NAME|null
  }
}

class VariableTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;  // TYPENAME
  }
}

exports.TypeTemplate = TypeTemplate;
exports.TypenameTemplate = TypenameTemplate;
exports.TemplateTypeTemplate = TemplateTypeTemplate;
