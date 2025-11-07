import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import {
  getIsEnvProd,
  ID_FOR_PROD,
  ID_FOR_STAGE,
  NAME_FOR_PROD,
  NAME_FOR_STAGE,
} from './config';
dotenv.config();

export async function updateManifestConfig(): Promise<void> {
  let isProd = false;
  try {
    isProd = getIsEnvProd();
  } catch {
    // No-op
  }

  try {
    console.log(`Updating manifest.json for ${isProd ? 'PROD' : 'STAGE'}`);

    // Define relative paths from current directory
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    // Read the Manifest file as string
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');

    // PROD VALUES
    if (isProd) {
      // Replace the id in the image line
      manifestContent = manifestContent.replace(ID_FOR_STAGE, ID_FOR_PROD);
      manifestContent = manifestContent.replace(NAME_FOR_STAGE, NAME_FOR_PROD);
      // Replace icons with prod versions
      manifestContent = manifestContent.replace(
        /icons\/(\d+)-dev\.png/g,
        'icons/$1.png'
      );
    } else {
      // Replace name to tag stage
      manifestContent = manifestContent.replace(NAME_FOR_PROD, NAME_FOR_STAGE);
      manifestContent = manifestContent.replace(ID_FOR_PROD, ID_FOR_STAGE);
      // Replace icons with dev versions
      manifestContent = manifestContent.replace(
        /icons\/(\d+)\.png/g,
        'icons/$1-dev.png'
      );
    }

    // Write the updated content back to the file
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
  } catch (error) {
    console.error('Error updating Manifest config:', error);
    throw error;
  }
}

// Execute the update function
updateManifestConfig()
  .then(() => {
    console.log(`Finished setting up manifest.json`);
  })
  .catch((error) => {
    console.error('Failed to update Manifest config:', error);
    process.exit(1);
  });
