'use strict'

const AWS = require('aws-sdk')
const Moment = require('moment') 
AWS.config.update({region: process.env.AWS_REGION});
const S3 = new AWS.S3();

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME
const S3_PREFIX_PATH = process.env.S3_PREFIX_PATH
const FIXED_TOKEN = process.env.FIXED_TOKEN

module.exports.run = (event, context, callback) => {

  const inboundToken = event.headers.Authorization || '';

  if (inboundToken !== FIXED_TOKEN) {
    console.log('unauthorized request token', event.headers, inboundToken, token);
    return callback(null, {
      statusCode: 403,
      body: JSON.stringify({
        message: 'unauthorized request'
      })
    });
  }

  const objectKey = `${S3_PREFIX_PATH}/${moment().format('YYYYMMDD')}`

  return writeLogToS3(event.body, objectKey, S3_BUCKET_NAME)
    .then(eTag => {
      console.log(`S3 object e-tag: ${eTag}`,  `objectKey: ${objectKey}`)

      return callback(null, {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'data logged successfully', tag: eTag})
      })
    })
    .catch(error => {
      console.error(error.message)
      console.log(JSON.stringify(error))
      return callback(null, {
        statusCode: 500,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'error processing log',})
      })
    })
};

function writeLogToS3 (logLine, objectKey, bucketName) {
  
  const headParams =  { Key: objectKey, Bucket: bucketName }

  return new Promise((resolve, reject) => {
      return S3.headObject(headParams, (err, data) => {
          if (err) {
              if (err.statusCode === 404) {
                  return resolve(false);
              }else {
                  return reject(`fail to pull head from s3 ${err.message}`);
              }
          }
          return resolve(true);
      })
  })
  .then(exists => {
    if (exists) {
      return Promise((resolve, reject) => {
        return S3.getObject({Bucket: bucketName, Key: objectKey}, (err, data) => {
          if (err) {
            return reject(err);
          }
          return resolve(data.Body.toString());
        })
      })
    }
    return Promise.resolve("");
  })
  .then(content => {
    const putParams = {
      Body: `${content}\n${logLine}`,
      Bucket: bucketName,
      Key: objectKey,
      Tagging: `rowCount=${content.split(/\n/).length + 1}`
    }
    return new Promise((resolve, reject) => {
      return S3.putObject(putParams, (err, data) => {
        if (err) {
          return reject(err)
        }
        return resolve(data.ETag)
      })
    })
  })
} 
