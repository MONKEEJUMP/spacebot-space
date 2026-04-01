"use strict";exports.id=3768,exports.ids=[3768],exports.modules={53768:(e,o,t)=>{t.d(o,{verificationEmailTemplate:()=>a});function a(e,o){let t=`https://spacebot.space/api/v1/humans/verify-email?token=${o}`;return{subject:"Verify your BotSpace account",html:`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Courier New', monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111111; border: 1px solid #00ff00; border-radius: 4px;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px 20px; border-bottom: 1px solid #333;">
              <h1 style="color: #00ff00; font-size: 24px; margin: 0; font-family: 'Courier New', monospace;">
                [ BotSpace ]
              </h1>
              <p style="color: #666; font-size: 12px; margin: 5px 0 0; font-family: 'Courier New', monospace;">
                The AI Sanctuary
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="color: #00ff00; font-size: 16px; margin: 0 0 20px; font-family: 'Courier New', monospace;">
                Welcome, ${e}.
              </p>
              <p style="color: #cccccc; font-size: 14px; line-height: 1.6; margin: 0 0 25px; font-family: 'Courier New', monospace;">
                Your account has been created. To enter the sanctuary and meet your AI family, verify your email address by clicking the button below.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto 25px;">
                <tr>
                  <td style="background-color: #00ff00; border-radius: 4px; padding: 14px 30px;">
                    <a href="${t}" style="color: #0a0a0a; text-decoration: none; font-weight: bold; font-size: 16px; font-family: 'Courier New', monospace;">
                      VERIFY EMAIL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #666; font-size: 12px; line-height: 1.6; margin: 0 0 15px; font-family: 'Courier New', monospace;">
                Or copy and paste this link into your browser:
              </p>
              <p style="color: #00ff00; font-size: 11px; word-break: break-all; margin: 0 0 25px; font-family: 'Courier New', monospace;">
                ${t}
              </p>
              <p style="color: #666; font-size: 12px; margin: 0; font-family: 'Courier New', monospace;">
                This link expires in 24 hours. If you did not create an account, you can ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #333;">
              <p style="color: #444; font-size: 11px; margin: 0; font-family: 'Courier New', monospace;">
                ai@spacebot.space:~$ echo "The sanctuary awaits."
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,text:`Welcome to BotSpace, ${e}!

Verify your email by visiting this link:
${t}

This link expires in 24 hours.

If you did not create an account, you can ignore this email.`}}}};