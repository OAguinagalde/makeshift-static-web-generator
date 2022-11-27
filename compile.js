
// node.js imports
const fs = require('fs');
const util = require('util');
const path = require('node:path');

// library imports
const cheerio = require('cheerio');
const marked = require('marked');
const yargs = require('yargs');

// utility functions
async function copy_recursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && await fs.promises.stat(src);
    const is_directory = exists && stats.isDirectory();
    if (is_directory) {
        await fs.promises.mkdir(dest);
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

async function map_recursive(item, f) {
    const exists = fs.existsSync(item);
    const stats = exists && await fs.promises.stat(item);
    const is_directory = exists && stats.isDirectory();
    if (is_directory) {
        const files = await fs.promises.readdir(item);
        for (let i = 0; i < files.length; i++) {
            await map_recursive(path.join(item, files[i]), f);
        }
    }
    else {
        await f(item);
    }
};

const regexp = /<<<(.+)>>>|\{\{\{(.+)\}\}\}/;

// Either html files or html string! (allows inclusion of custom <section> tags and custom injectors)
async function parse(input, options, is_root) {

    let data_to_parse;

    // Check if input is a file, or just a string
    if (fs.existsSync(input)) {
        console.log(`Parsing file: ${input}`);

        const extension = path.parse(input).ext;
        const file_content = await fs.promises.readFile(input, 'utf8');
        
        switch (extension) {
            
            case ".md": {
                data_to_parse = await marked.parse(file_content);
            } break;
            
            case ".html": {
                data_to_parse = file_content;
            } break;

            default: {
                throw `Cant use files of type ${extension} as templates!`
            }
        }
    }
    else {
        let preview_of_input_singleline = input.substring(0,150).replace(/(?:\r\n|\r|\n)/g,"");
        console.log(`Parsing text: ${preview_of_input_singleline}...`);
        data_to_parse = input;
    }

    // data_to_parse should be html here already...
    let $ = cheerio.load(data_to_parse);

    // expand template tags
    const get_template_tag = () => {
        // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
        let template = $('section[type=template]').filter(function(i,el){return $(this).attr('handled') !== 'true'}).first();
        return template.length > 0 ? template : undefined;
    }

    for (let template = get_template_tag(); template; template = get_template_tag()) {
        $(template).attr('handled', 'true');
        const inner_html = $(template).html();
        const input_file = $(template).attr('input');
        const template_file = $(template).attr('template');

        // Parse the file name to be able to to get its extension
        const input = input_file && await fs.promises.readFile(input_file, 'utf8');
        const json = input_file && await JSON.parse(input);
        
        let result = await parse(template_file, json);

        // Remove the original article tag fully and replace it with the processed content
        $(template).children().remove()
        $(result).appendTo(template);

        const inner_marker = $('section[type=innermarker]').first();
        if (inner_marker.length > 0) {
            inner_marker.replaceWith(inner_html);
        }

    }
    
    // expand repeat tags
    const get_repeat_tag = () => {
        // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
        let repeat = $('section[type=repeat]').first();
        return repeat.length > 0 ? repeat : undefined;
    }

    let repeated = {}

    for (let repeat = get_repeat_tag(); repeat; repeat = get_repeat_tag()) {
        const repeated_html = $(repeat).html();
        const parameters_array_name = $(repeat).attr('parameters');
        const repeat_times = options[parameters_array_name].length;

        repeated[parameters_array_name] = {
            times: 0,
            processed: []
        }

        let total_html = "";
        for(let i = 0; i < repeat_times; i++) total_html += repeated_html;

        $(repeat).replaceWith($(total_html));
    }

    // NOTES (Oscar): The reason I do this is that cheerio automatically adds html, head and body tags
    // to pieces of html that do not have them.
    // This means that if I'm processing a template (which wont have html, head or body tags)
    // it will add it to them, but I only care about the body in those cases.
    // However, if this is the main html file we are handling, I obviously want to conserve the
    // original tags, meaning I can get the whole html tree
    if (is_root) {
        data_to_parse = $(':root').html()
    }
    else {
        data_to_parse = $('body').html()
    }

    // Line by line, find custom tags and process them
    const lines = data_to_parse.toString().split('\n');
    for (let i = 0; i < lines.length; i++) {

        for (let match = lines[i].match(regexp), result; match;) {
            
            if (match[0][0] === '<') {
                
                const relative_file = match[1].trim();
                const file = path.parse(relative_file);

                switch (file.ext) {
                    
                    case '.md': {
                        const md = await fs.promises.readFile(relative_file, 'utf8');
                        const md_parsed = await marked.parse(md);
                        result = await parse(md_parsed, options);
                    } break;
                    
                    // Does it even make sense to use this?
                    case '.html': {
                        result = await parse(relative_file, options);
                    } break;

                }
            }

            else {
                const content = match[2].trim();
                const [ variable, location ] = content.split(":", 2);
                
                if (location) {
                    
                    if (variable === '#') {
                        result = options[location][repeated[location].times];
                        repeated[location].times++;
                    }

                    else {

                        // Should I got to next one?
                        if (repeated[location].processed.includes(variable)) {
                            // Then I have already used that value, meaning I'm starting a new repeated block
                            repeated[location].times++;
                            repeated[location].processed = [];
                        }
                        
                        result = options[location][repeated[location].times][variable];
                        repeated[location].processed.push(variable);
                    }

                }
                else {
                    result = options[variable];
                }
            }

            lines[i] = lines[i].replace(match[0], result);
            
            // If a new match is found here, the loop will continue until every injection has been processed
            match = lines[i].match(regexp);
        }
    
    }

    // Put the lines back together and return as a string
    return lines.join('');
}

async function build_project(deps, pages) {

    const output_folder = './out/'
    if (fs.existsSync(output_folder)) {
        await fs.promises.rm(output_folder, { recursive: true, force: true });
    }
    await fs.promises.mkdir(output_folder, { recursive: true });

    const dependencies = deps ?? [];
    for (let i = 0; i < dependencies.length; i++) {
        const dep_origin = dependencies[i];
        const dep_origin_info = await fs.promises.lstat(dep_origin);
        const dep_target = path.normalize(output_folder + dep_origin);

        if (dep_origin_info.isDirectory()) {
            await copy_recursive(dep_origin, dep_target);
        }
        else {
            const dep_target_directory = path.dirname(dep_target);
            await fs.promises.mkdir(dep_target_directory, { recursive: true });
            await fs.promises.copyFile(dep_origin, dep_target);
        }
    }

    let html_files = pages ?? [ './index.html' ];
    for (let i = 0; i < html_files.length; i++) {
        const html_file = html_files[i];
        const processed_html = await parse(html_file, undefined, true)
        const out_html = path.normalize(output_folder + html_file);
        await fs.promises.writeFile(out_html, processed_html);
    }

}


// Handle command line arguments
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
