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

## design principles

1. Safe
  1. It's ok to pay with performance if it improves debugging
    Examples:
    * Explicit stack traces with line numbers
    * async/await should have complete stack traces
      The performance cost here is copying the full stack trace
      when calling an async function
  2. (From Python) In the face of ambiguity, refuse the temptation to guess.
    Examples:
    * (From Python) A bug in the user's code should not be allowed to lead to
       undefined behavior; a core dump is never the user's fault.
  3. (From Python) Errors should never pass silently.
    Examples:
    * If 'await' or 'runAsync' is never called on a Promise, it will
      throw an error when the enclosing async stack frame group exits.
  4. (From Python) Readability counts.

2. Fun
  1. It's ok to pay with performance if it adds fun
    Examples:
    * Garbage collection. There might be better ways to handle this,
      but I couldn't really think of one (maybe Rust's way? but that seems
      hard to do, to incorporate life-times into the type system).
      Raw manual memory management can get super painful, and flies in
      the face of safe/debuggable.
      Reference counting or even just letting memory leak in the very
      worst case might still be better.

  2. Don't fight the underlying semantics
     Swift for instance makes working with JSON really tedious by trying
     to be "type-safe".
     It's ok to have areas that are less "safe" in some ways, if the
     underlying semantics are "unsafe" like with JSON.
     Just make sure that the boundaries of what is "safe" and what isn't
     is clear.
     In tt, the interactions are completely strongly statically typed,
     but Json itself is just treated as one blob type, and will throw
     a runtime exception if you try to use it in the wrong way.

3. Fast
  1. If it can be done fast while preserving the above two philosophies,
     do it.
     Examples:
     * Template Meta-programming
       Not yet fully implemented, but with instantiation stack traces
       (compile time trace based on what uses what) and a scripting-like
       meta-programming language that makes it easy, debuggable and fun.
       I'm thinking of basically a Python/Javascript/PHP kind of language.
     * Zero cost function dispatch.
       Since the types are all known at compile time, when transpiling,
       there doesn't need to be any runtime abstraction layer (e.g.
       a class that handles dispatching TT method names to javascript
       method names).


  Barring the above two rules, the performance mantra is same as in C++:

    What you do use, you couldn’t hand code any better.

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


