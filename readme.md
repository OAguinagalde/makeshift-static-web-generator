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

## Features

The features include:
* **Embeddeing markdown content** directly into the `html` files.
* **Bundling** the site and dependencies together in a single folder.
* A way to embed custom constructs into your markdown articles, which I call **templates**.
