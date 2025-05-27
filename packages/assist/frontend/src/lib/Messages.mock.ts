// This variable is nested deep inside mockMessageParts
export const mockMessageBody = `\r\nyeah\r\n\r\n\r\n\r\n\r\n------------------------------------\r\n\r\nhttps://example.com/\r\n\r\nSent with fake Mail secure email.`;

export const mockMessageParts = [
  {
    contentType: 'multipart/mixed',

    headers: {
      'content-type': [
        'multipart/mixed; boundary="------ce89be0809efa464d856ffb9ce24dcd1eee10b495104d2723f1581f322fdefac"',
      ],
    },

    size: 1173,

    partName: '1',

    parts: [
      {
        contentType: 'multipart/mixed',

        headers: {
          'content-type': [
            'multipart/mixed;boundary=---------------------84de12c001af883b559c01eba39ff816',
          ],
        },

        size: 1173,

        partName: '1.1',

        parts: [
          {
            contentType: 'multipart/alternative',

            headers: {
              'content-type': [
                'multipart/alternative;boundary=---------------------380f8d076bd89cc779083a7e2a7c62f9',
              ],
            },

            size: 1173,

            partName: '1.1.1',

            parts: [
              {
                contentType: 'text/plain',

                headers: {
                  'content-transfer-encoding': ['quoted-printable'],

                  'content-type': ['text/plain;charset=utf-8'],
                },

                size: 119,

                partName: '1.1.1.1',

                body: mockMessageBody,
              },

              {
                contentType: 'multipart/related',

                headers: {
                  'content-type': [
                    'multipart/related;boundary=---------------------7e37f775dbbc60dcbd9f10eb90cf890c',
                  ],
                },

                size: 1054,

                partName: '1.1.1.2',

                parts: [
                  {
                    contentType: 'text/html',

                    headers: {
                      'content-type': ['text/html;charset=utf-8'],

                      'content-transfer-encoding': ['base64'],
                    },

                    size: 1054,

                    partName: '1.1.1.2.1',

                    body: '<div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div><div style="font-family: Arial, sans-serif; font-size: 14px;">yeah</div>\n<div class="fakemail_signature_block" style="font-family: Arial, sans-serif; font-size: 14px;">\n    <div class="fakemail_signature_block-user">\n        <div style="font-family: Arial, sans-serif; font-size: 14px; color: rgb(0, 0, 0);"><span><br></span></div><div style="font-family: Arial, sans-serif; font-size: 14px; color: rgb(0, 0, 0);"><span><br></span></div><div style="font-family: Arial, sans-serif; font-size: 14px; color: rgb(0, 0, 0);"><span>------------------------------------<br></span></div><div><span><a href="https://example.com/" rel="noreferrer nofollow noopener" target="_blank">https://example.com/</a></span></div>\n    </div>\n    <div style="font-family: Arial, sans-serif; font-size: 14px;"><br></div>\n    <div class="fakemail_signature_block-fake">\n        Sent with <a target="_blank" href="https://fake.me/mail/home">fake Mail</a> secure email.\n    </div>\n</div>\n',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
