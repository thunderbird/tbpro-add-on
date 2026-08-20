import { checkIdAgainstSuspiciousFiles } from '@send-backend/models/uploads';
import { Router } from 'express';
import { TRANSFER_ERROR } from '../errors/models';
import { wrapAsyncHandler } from '../errors/routes';
import storage from '../storage';

const router: Router = Router();

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
