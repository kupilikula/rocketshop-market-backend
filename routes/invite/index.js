'use strict'

const fs = require('fs');

const emailListFile = './emailList.txt'; // Replace with the actual path to your file


module.exports = async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return 'App is running.'
  });
  fastify.post('/', async function (request, reply) {
    console.log('request.body:', request.body);
    const writeStream = fs.createWriteStream(emailListFile, { flags: 'a' });
    writeStream.write(request.body.email + '\\n', (err) => {
      if (err) {
        console.error('Error appending to file:', err);
        return;
      }

      console.log('Data appended to file successfully.');
      writeStream.end();
    });

  })
}
