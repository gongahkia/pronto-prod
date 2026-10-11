import {
  decryptChannelCredentials, encryptedChannelCredentialValues,
  protectChannelSettingsSecrets, usesLegacyPlaintextCredentials,
  type ChannelWithCredentialColumns,
} from "../src/lib/channels/credentials";
import { getPool, transaction } from "../src/lib/db";

type ChannelCredentialRow = ChannelWithCredentialColumns & {
  id: string;
  client_id: string;
  kind: string;
};

async function main() {
  const pool = getPool();
  const rows = await pool.query<{ id: string }>("select id from channels order by client_id, kind");
  let encryptedCount = 0;

  for (const item of rows.rows) {
    const migrated = await transaction(async (db) => {
      const selected = await db.query<ChannelCredentialRow>(
        "select * from channels where id = $1 for update", [item.id],
      );
      const channel = selected.rows[0];
      if (!channel || !usesLegacyPlaintextCredentials(channel)) return null;
      const decrypted = decryptChannelCredentials(channel);
      const protectedValues = protectChannelSettingsSecrets(
        { ...decrypted.settings, ...channel.settings },
        { ...decrypted.credentials, ...channel.credentials }, [],
      );
      const encrypted = encryptedChannelCredentialValues(protectedValues.credentials);
      await db.query(
        `update channels set settings = $3::jsonb, credentials = $4::jsonb,
           encrypted_credentials = $5, credentials_encryption_nonce = $6,
           credentials_encryption_tag = $7, updated_at = now()
         where id = $1 and client_id = $2`,
        [channel.id, channel.client_id, JSON.stringify(protectedValues.settings),
          JSON.stringify(encrypted.credentials), encrypted.encryptedCredentials,
          encrypted.nonce, encrypted.tag],
      );
      return { id: channel.id, clientId: channel.client_id, kind: channel.kind };
    });
    if (!migrated) continue;
    encryptedCount += 1;
    console.log(JSON.stringify({ event: "channel_credentials.encrypted",
      channelId: migrated.id, clientId: migrated.clientId, kind: migrated.kind }));
  }

  console.log(
    JSON.stringify({
      event: "channel_credentials.encryption_completed",
      encryptedCount,
    }),
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
