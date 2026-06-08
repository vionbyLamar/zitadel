import * as fs from 'fs';

const ZITADEL_URL = 'http://localhost:8080';
const PAT = 'mWIS6mHRjQw1kO9CTfbce8zawWYrv6r0QUOtIyfxGk0V7gJGIoOkx5S2VBX7FXPrUUoZGNY';

async function testCreateOrg() {
    console.log("Testing Org Creation...");
    const res = await fetch(`${ZITADEL_URL}/v2/organizations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PAT}`,
        },
        body: JSON.stringify({
            name: "KPN Example",
            admins: [
                {
                    userId: "376412836207329283" // the setup admin user id
                }
            ]
        })
    });
    console.log(res.status, await res.text());
}
testCreateOrg();
