import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import {
  addErrorHandling,
  UPLOAD_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';

import {
  createUpload,
  getItemsByUploadIdandWrappedKey,
  getUploadMetadata,
  getUploadParts,
  getUploadPartsByWrappedKey,
  getUploadSize,
  statUpload,
} from '../models/uploads';

import { getDataFromAuthenticatedRequest } from '@/auth/client';
import storage from '@/storage';
import { useMetrics } from '../metrics';
import {
  getGroupMemberPermissions,
  requireJWT,
  requireWritePermission,
} from '../middleware';

const router: Router = Router();

/**
 * @openapi
 * /api/uploads:
 *   post:
 *     summary: Create a new upload
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hash:
 *                 type: string
 *               size:
 *                 type: integer
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Upload created successfully
 *       400:
 *         description: Failed to create upload
 */
/**
 * This is actually the second step when uploading an encrypted file.
 * The first part is the actual upload via WebSockets.
 * This step creates the database entity for that uploaded file.
 */
router.post(
  '/',
  requireJWT,
  getGroupMemberPermissions,
  requireWritePermission,
  addErrorHandling(UPLOAD_ERRORS.NOT_CREATED),
  wrapAsyncHandler(async (req, res) => {
    const { id, size, ownerId, type, part } = req.body;
    const Metrics = useMetrics();

    const { uniqueHash } = getDataFromAuthenticatedRequest(req);

    const distinctId = uniqueHash;

    try {
      const upload = await createUpload(id, size, ownerId, type, part);
      // Capture metrics
      Metrics.capture({
        event: 'upload.size',
        properties: { size, type },
        distinctId,
      });
      await Metrics.shutdown();
      return res.status(201).json({
        message: 'Upload created',
        upload,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'Upload not created',
      });
    }
  })
);

/**
 * @openapi
 * /api/uploads/signed:
 *   post:
 *     summary: Get a pre-signed URL for uploading
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pre-signed URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 url:
 *                   type: string
 *       500:
 *         description: Failed to generate pre-signed URL
 */
router.post(
  '/signed',
  requireJWT,
  addErrorHandling(UPLOAD_ERRORS.NO_BUCKET),
  wrapAsyncHandler(async (req, res) => {
    const uploadId = uuidv4();
    const { type } = req.body;
    try {
      const url = await storage.getUploadBucketUrl(uploadId, type);
      return res.json({ id: uploadId, url });
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      return res.status(500).json(UPLOAD_ERRORS.NO_BUCKET);
    }
  })
);

/**
 * @openapi
 * /api/uploads/{id}/stat:
 *   get:
 *     summary: Get the statistics of an upload by ID
 *     tags: [Uploads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the upload
 *     responses:
 *       200:
 *         description: Upload statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 size:
 *                   type: integer
 *       404:
 *         description: Upload not found
 */
router.get(
  '/:id/stat',
  addErrorHandling(UPLOAD_ERRORS.FILE_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const size = await statUpload(id);
    res.status(201).json({
      size,
    });
  })
);

/**
 * @openapi
 * /api/uploads/{id}/size:
 *   get:
 *     summary: Get the size of an upload by ID
 *     tags: [Uploads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the upload
 *     responses:
 *       200:
 *         description: Upload size retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 size:
 *                   type: integer
 *       404:
 *         description: Upload not found
 */
router.get(
  '/:id/size',
  addErrorHandling(UPLOAD_ERRORS.FILE_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const size = await getUploadSize(id);
    res.status(201).json({
      size,
    });
  })
);

/**
 * @openapi
 * /api/uploads/{id}/metadata:
 *   get:
 *     summary: Get the metadata of an upload by ID
 *     tags: [Uploads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the upload
 *     responses:
 *       200:
 *         description: Upload metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metadata:
 *                   type: object
 *       404:
 *         description: Upload not found
 */
router.get(
  // TODO: decide whether it's a security risk not to protect this route.
  // I feel like it is, but it doesn't pertain to anything "perimssion-able".
  // i.e., permissions are applied to containers, not to uploads.
  '/:id/metadata',
  addErrorHandling(UPLOAD_ERRORS.FILE_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { id } = req.params;
    const metadata = await getUploadMetadata(id);
    res.status(201).json({
      ...metadata,
    });
  })
);

/**
 * @openapi
 * /api/uploads/{id}/parts:
 *   get:
 *     summary: Get parts of an upload by ID
 *     description: Retrieves all parts of a multipart upload by the upload ID
 *     tags: [Uploads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the upload
 *     responses:
 *       200:
 *         description: Upload parts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The ID of the upload part
 *                   part:
 *                     type: integer
 *                     description: The part number of the multipart upload
 *                 required:
 *                   - id
 *                   - part
 *             example:
 *               - id: "upload-123-part-1"
 *                 part: 1
 *               - id: "upload-123-part-2"
 *                 part: 2
 *       500:
 *         description: Failed to fetch upload parts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *               example:
 *                 message: "Failed to fetch upload parts"
 */
router.get('/:id/parts', async (req, res) => {
  const { id } = req.params;
  try {
    // Returns the id and part number of each upload
    const parts = await getUploadParts(id);
    res.status(200).json(parts);
  } catch (error) {
    console.error('Error fetching upload parts:', error);
    res.status(500).json({ message: 'Failed to fetch upload parts' });
  }
});

/**
 * @openapi
 * /api/uploads/parts:
 *   post:
 *     summary: Get upload parts by wrapped key
 *     description: Retrieves upload parts using a wrapped key for authentication
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wrappedKey:
 *                 type: string
 *                 description: The wrapped key for accessing the upload parts
 *             required:
 *               - wrappedKey
 *             example:
 *               wrappedKey: "wrapped-key-123"
 *     responses:
 *       200:
 *         description: Upload parts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The ID of the upload part
 *                   part:
 *                     type: integer
 *                     description: The part number of the multipart upload
 *                 required:
 *                   - id
 *                   - part
 *             example:
 *               - id: "upload-123-part-1"
 *                 part: 1
 *               - id: "upload-123-part-2"
 *                 part: 2
 *       500:
 *         description: Failed to fetch upload parts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *               example:
 *                 message: "Failed to fetch upload parts"
 */
router.post('/parts', requireJWT, async (req, res) => {
  const { wrappedKey } = req.body;
  try {
    // Returns the id and part number of each upload
    const parts = await getUploadPartsByWrappedKey(wrappedKey);
    res.status(200).json(parts);
  } catch (error) {
    console.error('Error fetching upload parts:', error);
    res.status(500).json({ message: 'Failed to fetch upload parts' });
  }
});

// Zod schema for validating the request body
const partsItemsSchema = z.object({
  ids: z.array(z.string()).min(1, 'At least one ID is required'),
  wrappedKey: z.string(),
});

/**
 * @openapi
 * /api/uploads/items:
 *   post:
 *     summary: Get upload items by IDs and wrapped key
 *     description: Retrieves multiple upload items using their IDs and a common wrapped key
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: Array of upload IDs to retrieve
 *               wrappedKey:
 *                 type: string
 *                 description: The wrapped key for accessing the upload items
 *             required:
 *               - ids
 *               - wrappedKey
 *             example:
 *               ids: ["upload-123", "upload-456", "upload-789"]
 *               wrappedKey: "wrapped-key-123"
 *     responses:
 *       200:
 *         description: Upload items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 description: Upload item data
 *             example:
 *               - id: "upload-123"
 *                 data: "item data 1"
 *               - id: "upload-456"
 *                 data: "item data 2"
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *               example:
 *                 message: "Invalid request body"
 *                 errors: []
 *       500:
 *         description: Failed to fetch upload parts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *               example:
 *                 message: "Failed to fetch upload parts"
 */
// This endpoint retrieves items by their upload IDs and the common wrapped key.
router.post('/items', async (req, res) => {
  try {
    // Validate the request body using Zod
    const { ids, wrappedKey } = partsItemsSchema.parse(req.body);

    // Returns the id and part number of each upload
    const items = await Promise.all(
      ids.map(async (id) => {
        const item = await getItemsByUploadIdandWrappedKey(id, wrappedKey);
        return item;
      })
    );
    res.status(200).json(items);
    // Validate schema and handle errors
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid request body',
        errors: error.errors,
      });
    }
    console.error('Error fetching upload parts:', error);
    res.status(500).json({ message: 'Failed to fetch upload parts' });
  }
});

export default router;
