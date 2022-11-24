// Example of usage
// 
//     await load_js("markdown_content/" + name + ".js");
//     const markdown_content = eval(name)
//     await load_js("node_modules/marked/marked.min.js");
//     return marked.parse(markdown_content);
// 
async function load_js(url) {
    
    let exists = document.querySelector(`script[src="${url}"]`);
    if (exists) return;

    console.log(`Loading script ${url}`);

    return new Promise((resolve, reject) => {
        let script_tag = document.createElement("script");
        script_tag.src = url;
        script_tag.type = 'text/javascript';
        script_tag.onload = () => {
            console.log(`Loaded script ${url}`);
            resolve();
        };
        document.body.appendChild(script_tag);
    })
    
}
