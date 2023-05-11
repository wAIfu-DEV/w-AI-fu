(async function() {
    console.log('Hello, World!');

    const resp = await fetch('http://127.0.0.1:7850/api', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ 'data': ['This is a test', 'galette'] })
    });
    const data = await resp.json();

})();