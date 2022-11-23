# Makeshift static website generator

You need to install the dependencies with `npm install`.

Running `node .\compile.js` will take the content in the file `content.md` and generate a file called `generated.js`.

The generated file contains the content of the markdown file escaped.

Then just open `index.html` and it will show what the `content.md` has directly there.
