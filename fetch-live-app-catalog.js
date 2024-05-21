const axios = require('axios');
const fs = require('fs');
const _ = require('lodash');

const filePath = 'live-app-catalog.json';
const etagFilePath = 'etag.txt';

async function fetchLiveAppCatalog() {
  const url = 'https://live-app-catalog.ledger.com/api/v1/apps';

  const options = {
    headers: {}
  };

  // Check if ETag exists and add it to the request headers
  if (fs.existsSync(etagFilePath)) {
    const etag = fs.readFileSync(etagFilePath, 'utf8');
    options.headers['If-None-Match'] = etag;
  }

  try {
    const response = await axios.get(url, options);
    const { status, data, headers } = response;

    // Check if the response status is 200 or 304
    if (status === 200 || status === 304) {
      const jsonData = data;

      if (status === 200) {
        // Check if the file exists
        if (fs.existsSync(filePath)) {
          const existingData = fs.readFileSync(filePath, 'utf8');
          const existingJson = JSON.parse(existingData);

          // Normalize both JSON objects
          const normalizedExistingJson = normalizeJson(existingJson);
          const normalizedJsonData = normalizeJson(jsonData);

          // Compare the new data with the existing data
          const differences = findDifferences(normalizedExistingJson, normalizedJsonData);
          if (differences.length > 0) {
            console.error('Error: The pulled response is different from the existing JSON.');
            differences.forEach(diff => {
              console.error(`Difference at path: ${diff.path}`);
              console.error(`Existing value: ${diff.obj1}`);
              console.error(`New value: ${diff.obj2}`);
            });
            process.exit(1); // Exit with an error code
          } else {
            console.log(`Status Code: ${status} :\nData fetched is the same as existing data, no update needed.\neTag updated`);
          }
        } else {
          // Save the new data if the file does not exist
          fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
          console.log('Data fetched and saved successfully');
        }

        // Save the new ETag
        const etag = headers['etag'];
        if (etag) {
          fs.writeFileSync(etagFilePath, etag);
        }
      } else if (status === 304) {
        console.log(`Status Code: ${status} :\nData not modified, no update needed`);
      }
    } else {
      console.error(`Request failed with status code: ${status}`);
      process.exit(1); // Exit with an error code
    }
  } catch (error) {
    if (error.response && error.response.status === 304) {
      console.log('Status Code: 304\nData not modified, no update needed');
    } else {
      console.error('Error fetching data:', error.message);
      process.exit(1); // Exit with an error code
    }
  }
}

function normalizeJson(obj) {
  if (typeof obj === 'string') {
    return obj.normalize(); // Normalize Unicode characters
  } else if (Array.isArray(obj)) {
    return obj.map(normalizeJson);
  } else if (typeof obj === 'object' && obj !== null) {
    const normalizedObj = {};
    for (const key of Object.keys(obj)) {
      normalizedObj[key] = normalizeJson(obj[key]);
    }
    return normalizedObj;
  }
  return obj;
}

function findDifferences(obj1, obj2) {
  const differences = [];
  const compare = (obj1, obj2, path = '') => {
    if (_.isEqual(obj1, obj2)) return;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
      differences.push({ path, obj1, obj2 });
      return;
    }
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
    keys.forEach(key => {
      compare(obj1[key], obj2[key], path ? `${path}.${key}` : key);
    });
  };
  compare(obj1, obj2);
  return differences;
}

fetchLiveAppCatalog();
