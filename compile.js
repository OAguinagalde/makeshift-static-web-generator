// ::: node.js imports :::
const fs = require('fs');
const util = require('util');
const path = require('node:path');

// ::: library imports :::
// * Using `cheerio` for DOM manipulation. Its basically a `JQuery` alternative.
// * Using `marked` for parsing markdown files into html.
// * Using `yargs` for parsing command line parameters
const cheerio = require('cheerio');
const marked = require('marked');
const yargs = require('yargs');

// ::: utility functions :::

// Copies `src` (can be either a file or a folder) and puts it into `dest`. Examples:
// 
//     copy_recursive('./some_folder', './newfolder/some_folder')
// 
async function copy_recursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && await fs.promises.stat(src);
    const is_directory = exists && stats.isDirectory();
    if (is_directory) {
        if (!fs.existsSync(dest)) await fs.promises.mkdir(dest);
        const files = await fs.promises.readdir(src);
        for (let i = 0; i < files.length; i++) {
            await copy_recursive(
                path.join(src, files[i]),
                path.join(dest, files[i])
            );
        }
    }
    else {
        await fs.promises.copyFile(src, dest);
    }
};

// ::: The main program :::
// It consists of 2 methods:
// * `build_project`, the function which will bundle the dependencies and the pages into the out folder
// * `parse`, the meaty part of this tool. It handles the processing fo the pages.

// The regular expression for finding the ingjection tags such as:
// 
//     {{{some_variable}}}
//     <<<some/file.md>>>
// 
const regexp = /<<<(.+)>>>|\{\{\{(.+)\}\}\}/;

// The meaty part of this tool.
// Given an input (which must be either an `html` or `md` file, OR a valid `html` string) it will:
// 1. Read the file and parse it if necessary (when its markdown basically)
// 2. Handle all the <section type="template"> tags
// 3. Handle all the <section type="repeat"> tags
// 4. Handle all the injection tags (<<<>>> or {{{}}})
// 5. Return the final html string
async function parse(input, options, is_root) {

    let html_to_process;

    // Check if input is a file, or just a string.
    // If its a file it must be read, since data_to
    if (fs.existsSync(input)) {
        console.log(`Parsing file: ${input}`);

        const extension = path.parse(input).ext;
        const file_content = await fs.promises.readFile(input, 'utf8');
        
        switch (extension) {
            
            case ".md": {
                html_to_process = await marked.parse(file_content);
            } break;
            
            case ".html": {
                html_to_process = file_content;
            } break;

            default: {
                throw `Cant use files of type ${extension} as templates!`
            }
        }
    }
    else {
        let preview_of_input_singleline = input.substring(0,150).replace(/(?:\r\n|\r|\n)/g,"");
        console.log(`Parsing text: ${preview_of_input_singleline}...`);
        html_to_process = input;
    }

    // Load the html with `cheerio` which will allow to easily manipulate it
    // later on. It works the same as `JQuery`.
    let $ = cheerio.load(html_to_process);

    /* Find every tag of type <section type="template"> and inject the template */ {

        // Return the first <section type="template"> tag that has not been handled yet.
        // Return undefined otherwise.
        const get_template_tag = () => {
            
            // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
            let template_tag = $('section[type=template]').filter(function(i,el){return $(this).attr('handled') !== 'true'}).first();
            return template_tag.length > 0 ? template_tag : undefined;
        }

        // For as long as there is unhandled <section type="template"> tags...
        for (let template = get_template_tag(); template; template = get_template_tag()) {
            
            // Set the tag as handled to not handle it later on again
            $(template).attr('handled', 'true');

            const inner_html = $(template).html();
            const template_file = $(template).attr('template');
            const input_file = $(template).attr('input');

            // Get the input data to be injected into the template
            // If no input is provided, just pass undefined as the tempalte input
            const input = input_file && await fs.promises.readFile(input_file, 'utf8');
            const json = input_file && await JSON.parse(input);
            
            // Recursively call parse (this function), which will parse
            // this particular template file only With its input data
            let parsed_html = await parse(template_file, json);

            // Remove the original tag and re-add the parsed version of it
            $(template).children().remove()
            $(parsed_html).appendTo(template);

            // If there was a <section type='innermarker'>, inject it it there
            const inner_marker = $('section[type=innermarker]').first();
            if (inner_marker.length > 0) {
                inner_marker.replaceWith(inner_html);
            }
        }

    }
    
    let repeated = {}

    /* Find every tag of type <section type="repeat"> and repeat its content accordingly */ {

        // Return the first <section type="repeat">.
        // Return undefined otherwise.
        const get_repeat_tag = () => {
            let repeat = $('section[type=repeat]').first();
            return repeat.length > 0 ? repeat : undefined;
        }

        // For as long as there is unhandled <section type="template"> tags...
        for (let repeat = get_repeat_tag(); repeat; repeat = get_repeat_tag()) {
            const repeated_html = $(repeat).html();
            const input_object_name = $(repeat).attr('input');
            const repeat_times = options[input_object_name].length;

            // This variable will keep track of repited blocks of html
            // and is necessary for injecting the `{{{...}}}` variables later on.
            repeated[input_object_name] = {
                times: 0,
                processed: []
            }

            // Literally repeat the html as many times as needed
            let total_html = "";
            for(let i = 0; i < repeat_times; i++) total_html += repeated_html;

            // Removes the original <section type="repeat"> and put there the repeated html
            $(repeat).replaceWith($(total_html));
        }
    }

    // NOTES (Oscar): The reason I do this is that cheerio automatically adds <html>, <head> and <body> tags
    // to pieces of html that do not have them.
    // 
    // This means that if I'm processing a template (which wont have <html>, <head> or <body> tags)
    // it will add it to them, but I only care about the body in those cases.
    // 
    // However, if this is the main html file we are handling, I obviously want to conserve the
    // original tags, meaning I wante to get the whole html tree
    if (is_root) {
        html_to_process = $(':root').html()
    }
    else {
        html_to_process = $('body').html()
    }

    // Split the file in lines, and line by line find all the
    // <<<>>> and {{{}}} tags, and inject the required data in them.
    const lines = html_to_process.toString().split('\n');
    for (let i = 0; i < lines.length; i++) {

        // Loop for as long as there is a match for those tags
        for (let match = lines[i].match(regexp), result; match;) {
            
            
            // If the matched tag starts with '<' it means its a `<<<some_file>>>` tag
            // So we can just recursively call parse (this function), which will parse
            // this particular file and get the result
            if (match[0][0] === '<') {
                // NOTES (OSCAR): I'm not even sure whether this makes sense, since we can already inject
                // other files with the html tags <section type="template">... I guess this allows to easily write
                // <<<some/file.md>>> inside json files, since its shorter? I might remove this eventually...
                const relative_file = match[1].trim();
                result = await parse(relative_file, options);                
            }

            // Otherwise this is a `{{{some_variable}}}` tag.
            else {
                const content = match[2].trim();
                
                // Variables with this syntas {{{var:list}}} can be used in <section type="repeat"> tags.
                // If var === '#' it means that its a list of primitive types:
                // 
                //     { "myList": [ 'thing1', 'thing2' ]}
                // 
                // Else, the list is a list of objects, where var is the name of the field inside the object:
                // 
                //     { "myList": [ { "name": "Oscar", "city": "Seoul" } ]}
                // 
                const [ variable, list ] = content.split(":", 2);
                if (list) {
                    
                    if (variable === '#') {
                        result = options[list][repeated[list].times];
                        repeated[list].times++;
                    }

                    else {

                        if (repeated[list].processed.includes(variable)) {
                            // If a variable is already processed, it means that we are in the
                            // next repeated block of html So clear the processed list
                            // The variable Times allows us to know which object are we injecting now
                            repeated[list].times++;
                            repeated[list].processed = [];
                        }
                        
                        result = options[list][repeated[list].times][variable];
                        
                        // mark the variable as processed
                        repeated[list].processed.push(variable);
                    }

                }
                // If the variable is just an string, without ':', then it means its not a repeated html block
                // so just get the variable and inject it
                else {
                    result = options[variable];
                }
            }

            // Finally replace the original {{{}}} or <<<>>> tags with the new data
            lines[i] = lines[i].replace(match[0], result);
            
            // If a new match is found here, the loop will continue
            match = lines[i].match(regexp);
        }
    
    }

    // Put the lines back together and return as a string
    return lines.join('');
}

// This is the function which will bundle the dependencies and the pages into the out folder
async function build_project(deps, pages) {

    // If the ./out folder exists, remove it and create it again (but empty)
    const output_folder = './out/'
    if (!fs.existsSync(output_folder)) {
        await fs.promises.mkdir(output_folder, { recursive: true });
    }

    // Copy all the files and folders marked as dependencies
    const dependencies = deps ?? [];
    for (let i = 0; i < dependencies.length; i++) {
        const dep_origin = dependencies[i];
        const dep_origin_info = await fs.promises.lstat(dep_origin);
        const dep_target = path.normalize(output_folder + dep_origin);

        // If the dependency is a folder, copy the folder recursively.
        if (dep_origin_info.isDirectory()) {
            await copy_recursive(dep_origin, dep_target);
        }
        // Else, copy the file (and create the folder path if necessary)
        else {
            const dep_target_directory = path.dirname(dep_target);
            await fs.promises.mkdir(dep_target_directory, { recursive: true });
            await fs.promises.copyFile(dep_origin, dep_target);
        }
    }

    // Parse every html file marked as a page and copy it to the out folder
    let html_files = pages ?? [ './index.html' ];
    for (let i = 0; i < html_files.length; i++) {
        const html_file = html_files[i];
        const processed_html = await parse(html_file, undefined, true)
        const out_html = path.normalize(output_folder + html_file);
        await fs.promises.writeFile(out_html, processed_html);
    }

}

// Handle command line arguments
// TODO: No need to use yargs, just parse the process.argv manually
const argv = yargs.command('build', 'build the static site in ./out', {
    dependencies: {
        description:
            `An array of files or folders, which will be copied over to the output folder. They must be relative to the projects root`,
        type: 'array',
        requiresArg: true,
    },
    pages: {
        description:
            `An array of html files to be processed. Must be in the root of the folder.`,
        type: 'array',
        requiresArg: true,
    },
}).demandCommand(1, 1).argv;

switch (argv._[0]) {
    
    case 'build': {
        build_project(argv.dependencies, argv.pages);
    } break;
    
    default: {
        build_project();
    } break;

}
