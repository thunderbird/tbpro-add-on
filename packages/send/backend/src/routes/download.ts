import { checkIdAgainstSuspiciousFiles } from '@send-backend/models/uploads';
import { Router } from 'express';
import { TRANSFER_ERROR } from '../errors/models';
import {
  addErrorHandling,
  DOWNLOAD_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';
import storage from '../storage';

const router: Router = Router();

// Security for this route will be addressed in ticket #101
router.get(
  '/:id',
  addErrorHandling(DOWNLOAD_ERRORS.DOWNLOAD_FAILED),
  wrapAsyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
      const contentLength = await storage.length(id);

      const fileStream = await storage.get(id);

      if (!fileStream) {
        console.error('fileStream is null');
        return res.status(404).send(TRANSFER_ERROR);
      }

      let canceled = false;

      req.on('aborted', () => {
        canceled = true;
        try {
          fileStream.destroy();
        } catch (error) {
          console.error(error);
        }
      });

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': contentLength,
      });
      fileStream.pipe(res);

      fileStream.on('finish', async () => {
        if (canceled) {
          return;
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return res.status(404).send(TRANSFER_ERROR);
    }
  })
);

/*
 * This route is used to get a signed URL for downloading a file.
 */
router.get(
  '/:id/signed',
  wrapAsyncHandler(async (req, res) => {
    const { id } = req.params;

    const isSuspicious = await checkIdAgainstSuspiciousFiles(id);
    if (isSuspicious) {
      return res
        .status(401)
        .send(
          `${TRANSFER_ERROR}: This file has been reported as suspicious, download blocked.`
        );
    }
    try {
      const bucketUrl = await storage.getDownloadBucketUrl(id);

      return res.json({ url: bucketUrl });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return res.status(404).send(TRANSFER_ERROR);
    }
  })
);

router.get('/check-upload-id/:id', async (req, res) => {
  const { id } = req.params;

  const isSuspicious = await checkIdAgainstSuspiciousFiles(id);
  res.status(200).json({ message: 'Hash checked', isSuspicious });
});

export default router;
