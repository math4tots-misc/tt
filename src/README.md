# tt programming language

## list of special functions

1. Dunder (double underscore) functions.
   The names are usually same as those in Python.
   Comparison
   * \_\_eq\_\_
   * \_\_ne\_\_
   * \_\_lt\_\_
   * \_\_gt\_\_
   * \_\_le\_\_
   * \_\_ge\_\_

   Arithmetic
   * \_\_add\_\_
   * \_\_sub\_\_
   * \_\_mul\_\_
   * \_\_div\_\_
   * \_\_mod\_\_


2. Special function names.
   * new  -- for creating new instances of objects
   * delete  -- if x is an auto variable, "delete(x)" always gets called
                when x goes out of scope.
   * malloc  -- should only be used in 'new' functions
   * len  -- size of a container
   * repr  -- for a more detailed conversion to String
   * str  -- for conversion to String
   * int  -- for conversion to Int
   * float  -- for conversion to Float
   * just  -- for creating a Maybe type with a given value
   * nothing  -- for creating a Maybe type with Nothing.

3. Special method names.
   * to  -- for conversion to arbitrary types.
            e.g. new(Json, 5.5).to(Int);

## Type expressions

  There are 4 types of type expressions

  1. Typename
     These are just names. Like `Int` or `String`.

  2. TemplateType
     These are types with arguments. Like `List[Int]`.

  3. SymbolType
     These are essentially compile time strings.
     Symbol types always start with a `:`.
     A common symbol type that is used is `:Method`.
     Symbol types are abstract in that they can't actually be the
     type of a variable. They are just used to decorate the type of
     a function or class.

  4. VariableType
     These are, as their name suggests, variables that stand in for one of
     the other concrete types. They start with a dollar sign, like in `$T`.

## Type template specificity

When multiple function templates match, we choose the one with the one
with the most specific left-most argument. If the left-most argument
types have the same specificity, we consider the next left-most argument type.

From most specific to least specific:

  1. Fully specified type that isn't an interface, with no type variables.
     This includes all symbols.
  2. TemplateType with at least one type variable.
     To compare two TemplateTypes, we consider the leftmost
     type argument of the template type, and recurse.
  3. Interface (interfaces are not yet implemented)
  4. Type variable. This is the least specific as this may literally match
     anything.

## Features

### Keyword arguments

If you have a function definition that looks like:

    fn updatePetName(oldPetName String, newName String) {...}

and you use it:

    updatePetName("Fluffy", "Snuggles");

It's not immediately clear whether "Fluffy" or "Snuggles" is the new name.

Keyword arguments feature can make this clearer:

    updatePetName("Fluffy", newName: "Snuggles");

Now it's very obvious to whoever is reading the code that "Snuggles" is the
new name.

The compiler checks that the key actually matches the name of the argument.

So in the above example,

    updatePetName("Fluffy", asdf: "Snuggles");

will not compile.

This is all that "keyword arguments" do in TT. It's not as fancy as keyword
arguments in many other languages that can do a lot of fancy things like
reorder arguments and provide optional arguments, but TT uses the types and
order of arguments so extensively that I think adding features like that
would make TT code harder to reason about.

The keyword arguments is really about code *Safety*.


