# Makeshift static website generator

This is a work-in-progress makeshift static website generator.

"Makeshift" as in:  
> /ˈmākˌSHift/  
> adjective  
> serving as a temporary substitute; sufficient for the time being.  

Except I'll probably rather stick to it rather than learn yet another tool (such as Jekyll or whatever).

## Usage

The repository includes both the static website generator (mostly just `compile.js`) as well as an example of a site to generate (including `index.html` and the folders `./src` and `./markdown_content`).

In order to generate the site just execute `node compile.js` and the tool will put the ready to use static website in the `./out` folder.

You can also build the application into a single `exe` file by running `npx pkg -t node18-win .\compile.js`, which will generate a file `compile.exe`, which you can then execute freely in a different project.

## Features

The features include:
* **Embeddeing markdown content** directly into the `html` files.
* **Bundling** the site and dependencies together in a single folder.
* A way to embed custom constructs into your markdown articles, which I call **templates**.

## Manual

### Setup dependencies and pages

The `compile.js` file contains these in the source code:

```js
async function build_project() {
    
    // ...

    const dependencies = [
        './src/',
    ];

    // ...

    const html_files = [
        './index.html',
    ];
    
    // ...
}
```

The array of `dependencies` specifies the files that are hard dependencies for the project. These can be either single files such as `./node_modules/some_library/some_library.min.js` or full folders such as `./src`. These will be copyed as-is directly into the `./out` folder. Anything that the page `index.html` requires should be listed in the `dependencies` array.

Note that the main site `index.html` should be listed in the array `html_files`, since these are not copied as is like the `dependencies` are. Instead, all the files in `html_files` will be processed. That processing will transform those `html` files without modifying the original ones, and put the processed version on the `./out` folder.

The processing of `html` files includes:
* Embedding markdown articles
* Processing templates inside markdown articles

### Markdown article embedding

For every `article` element with an `id` set, the compiler will look for a file `./markdown_content/id.md`, and if it exists, it will embed the markdown inside the `article` tag.

```html
<article id="some_id"></article>
```

In that case, the compiler will look for the file `./markdown_content/some_id.md` and put it in there.

### Using Template constructs inside Markdown

You can use templates in order to add things to your markdown articles that are otherwise not possible with only markdown.

It's not great or easy, as it requires the template to be directly implemented inside the source code of `compile.js`. Here is an example...

Say you want to add a center-aligned piece of text, you can do so by writing this inside your markdown file:

````markdown
```json
/*template*/
{
    "template":"fancy_subtitle",
    "config": {
        "position":"center",
        "content": "24/11/2022"
    }
}
```
````

The `compile.js` contains this code, which will find that construct in the markdown files, and handle it to obtain the desired effect.

```js
switch (template_json.template) {
    
    // If the template is of type fancy_subtitle
    case "fancy_subtitle": {
        // Get the configuration fo the template
        const config = template_json.config;
        // Un using `cheerio` to manipulate the dom here.
        // This line of code is basically taking the html element that represents the markdown template piexe of text we wrote "$($(pre_code).parent())".
        // And then it replaces it with a <div> tag, making it so that the original element gets replaced with the desired construct.
        $($(pre_code).parent()).replaceWith($(`<div style="text-align: ${config.position};">${config.content}<div>`));
    } break;
}
```
