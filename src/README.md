# tt programming language


## design principles

1. Debuggable
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
    * Garbage collection. There might be better ways to implement this,
      but I couldn't really think of one (maybe Rust's way? but that seemed
      hard to do, to incorporate life-times into the type system).
      Manual memory 

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
