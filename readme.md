# Makeshift static website generator

This is my personal makeshift static website generator, `mswg`.

```
Makeshift, adjective:
/ˈmākˌSHift/
> Serving as a temporary substitute; sufficient for the time being.
```

It tries to be a much simpler (around 300 loc) and feature-less alternative to other similar tools.

This repository includes:
* The source code for `mswg`: The static website generator (`compile.js`, which is fully documented)
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

The tool `mswg` allows you to:

* Embed markdown content directly into the a **page**.
* Write `html` **templates** which you can reuse by providing different input data int `json` format, and inject those into your markdown files and **page**s.
* Bundle the `project` and it's `dependencies` together in a single folder, ready to be deployed.

## Manual

### Projects, Dependencies and Pages

There is 3 simple concepts to understand when using this tool:

* The **Project** is a folder which contains all the files required to build your static website.
    Check out the folder `example` for an example project.

* A **page** is any `html` or markdown file, which may or may not make use of **templates**.
    Your project may have multiple pages, which you can declare like this:
    ```ps1
    mswg.exe build --dependencies ./src ./css --pages index.html about.html
    ```
* The project **dependencies** are the files that your **pages** require to properly work, such as `css` or `js` files, or even a folder full of files called `./resource`.
    You can declare them like this:
    ```ps1
    mswg.exe build --dependencies ./src ./css ./node_modules/some_lib/lib.min.js --pages index.html
    ```

### Embedding `html`, `md` or `templates` into your pages

Here is an example that use most of the features of the project:

> NOTE! There is no way (for now?) to escape `<` or `{` so, during the incoming examples, whenever you see `{{` or `<<`, know that `mswg` expects them to be in triplets, not doubles like in this examples!

Say we have a `templates/project_list.html` template for listing open-source projects. It might look something like this...

```html
<h1>{{title}}</h1>
<!-- Special repeated section! -->
<section type="repeat" input="list">
    <h2>{{title:list}}</h2>
    <p style="text-align: right; color:gray">
        {{dateRange:list}}
    </p>
    <div class="border p-3 m-3">
        {{description:list}}
    </div>
</section>
```

... and a `data/projects.2022.json` file with the data that will populate said template:


```json
{
    "title": "My projects of 2022",
    "list": [
        {
            "dateRange": "2022 October ~ 2022 November",
            "title": "Project Cutepon",
            "description": "I made a web application at https://cutepon.net!"
        },
        {
            "dateRange": "2022 November ~ 2022 December",
            "title": "Makeshift Static Website Generator",
            "description": "<<../readme.md>>"
        }
    ]
}
```

We can embed this data directly into our page `index.html` by adding the tag:

```html
<section type="template" template="templates/project_list.html" input="data/projects.2022.json"></section>
```

The resulting html will contain the `<section type="repeat">` twice, since there is 2 items inside the `list` in the input file.

As you can see there is 2 types of special tags: `<<some/file.html>>` and `{{input_variable}}`.
* The first type `<<>>` will directly include the file in-place.
  * Both `html` and markdown files are allowed. 
  * These are parsed recursively. Meaning, you can set the description as `"description": "<<../readme.md>>>"` and the `../readme.md` file will be directly inserted in the description.
* The second type `{{}}` will inject the data from the input object.
  * If they are inside a `<section type="repeat">` they must be include the list of objects where the data is taken from, like this `{{field_name:list_name}}`. The `list_name` must match the attribute `input` in the `<section>` tag.
  * If the `input` list is an array of primitive types rather than objects, just declare them like this `{{#:list_name}}`


## Used in...

These websites use `mswg`: <https://oaguinagalde.github.io/> and <https://imsujinpark.github.io/>.
