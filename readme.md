# Makeshift static website generator

This is a work-in-progress makeshift static website generator.

```
Makeshift, adjective:                                /ˈmākˌSHift/
> Serving as a temporary substitute; sufficient for the time being.  
```

Except I'd rather stick to it rather than learn yet another tool (such as Jekyll or whatever).

This repository includes:
* The source code for `mswg`: The static website generator (`compile.js`)
* An example project (`./example`) to be built with `mswg`.

## Usage

You can either directly run the code with node...

```ps1
cd example
node ../compile.js build --dependencies src --pages index.html
```

... or you can also **package** the tool into a single binary file (`mswg.exe`) by running the script `build.ps1`.

```ps1
./build.ps1
cd example
../bin/mswg.exe build --dependencies src --pages index.html
```

> Check the script `build.ps1` for details on how to build the tool for `macos` or `linux`

## Features

The features include:
* Embed `markdown` content directly into the website's `page`s.
* Write parameterized `templates` which you can inject and reuse into your `markdown` articles.
* Bundle the `project` and it's `dependencies` together in a single folder, ready to deploy.

## Manual

### Projects, Dependencies and Pages

There is 3 simple concepts to understand when using this tool:

* The **Project** is a folder which contains all the files required to build your static website.
    * You can find an `example` of a project in the example folder.

* The project's **dependencies** are the files that will be required for the final website to work correctly during "runtime".
    * Style `css` files and javascript source code that the website uses, **are dependencies** of the website.  
    * However, any file in your project that is not required for the final website (such as a `readme.md` or a `.gitignore` file), is **not a dependency**.
    * Both folders and files are allowed as dependencies:
    ```ps1
    mswg.exe build --dependencies ./src ./css ./node_modules/some_lib/lib.min.js

* Finally, a **page** is an `html` file which is not complete until this tool has processed it and embedded any template or `markdown` file that it requires.
  * Your project may have multiple pages, if for example, `index.html` has a link to `about.html`
    ```ps1
    mswg.exe build --dependencies ./src ./css --pages index.html about.html
    ```

### Markdown article embedding

For every `article` element with an `id` set, the compiler will look for the file, and if it exists, it will embeded inside `article` tag.

```html
<article id="artciles/some_markdown_article.md"></article>
```

This embedding process happens during "compile time". That means that the page `index.html` and the page `./out/index.html` will be different, since the one in out already contains the `markdown` inside.

### Using Templates inside Markdown

Since `markdown` has a rather limited features, you can use templates to personalize your mages in a more dyncamic way.

Templates allow you to define an `html` template file which can contain these special tags:
* `<<<md:articles/some_article.md>>>`: This allows you to introduce pieces of `markdown` directly in the template.
* `<<<html:templates/some_other_template.html>>>`: This allows you to introduce a template inside of the template.
* `{{{some_variable}}}`: This allows you to set the values that the template should use, allowing the template to be reusable.
    These variables are set via the `config` element of the `json` object that is pased to the template (more on this down below).

A template file looks something like this:

```html
<div style="background-color: {{{color}}} ">

    <p>This is an html template</p>

    <p>Also, you can insert a template inside a template, like this!</p>

    <<<html:templates/title.html>>>

    <p>Finally, you can embed markdown files directly like this</p>

    <<<md:articles/markdown_file.md>>>

</div>
```

You can use a template in your `markdown` article by defining the **template file** and its **parameters**, like this:

````
```json
/*template*/
{
    "template":"some/template/file.html",
    "config": {
        "some_parameter": "red",
    }
}
```
````

> Its important that the `json` object uses valid syntax, since it will be parsed with `JSON.parse`.
> Also, the `/*template*/\n` tag is expected to be there, as a way to recognize templates from other `markdown` constructs.

Finally here is a template example:

> Say you want to add particular piece of `html` in one of your `markdown` articles.
> You can do so by defining a template file `templates/title_with_adjective.html` such as this:
> 
> ```html
> <h1>This is a {{{adjective}}} templated title!</h1>
> ```
>
> In order to use it, you can add this text to your `markdown` files, which allows you to add 
> values to be replaced in the template.
> 
> ````
> ```json
> /*template*/
> {
>     "template":"templates/title_with_adjective.html",
>     "config": {
>         "adjective":"great",
>     }
> }
> ```
> ````
>
> If done correctly, the template should be rendered inside the `markdown` file.

