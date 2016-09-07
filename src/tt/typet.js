// typet.js
// type templates
// text =(parser)=> type templates =(annotator resolves to)=> type(type.js)

const type = require("./type.js");
const err = require("./err.js");

const Type = type.Type;
const Typename = type.Typename;
const SymbolType = type.SymbolType;
const TemplateType = type.TemplateType;
const CompileError = err.CompileError;


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


exports.TypeTemplate = TypeTemplate;
exports.TypenameTemplate = TypenameTemplate;
exports.SymbolTypeTemplate = SymbolTypeTemplate;
exports.OrTypeTemplate = OrTypeTemplate;
exports.AndTypeTemplate = AndTypeTemplate;
exports.TemplateTypeTemplate = TemplateTypeTemplate;
exports.VariableTypeTemplate = VariableTypeTemplate;


