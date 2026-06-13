import { encryptedChannelCredentialValues } from "../src/lib/channels/credentials";
import { getPool } from "../src/lib/db";

type ChannelCredentialRow = {
  id: string;
  client_id: string;
  kind: string;
  credentials: Record<string, unknown>;
};

async function main() {
  const pool = getPool();
  const rows = await pool.query<ChannelCredentialRow>(
    `
      select id, client_id, kind, credentials
      from channels
      where credentials <> '{}'::jsonb
        and encrypted_credentials is null
      order by client_id, kind
    `,
  );

  for (const channel of rows.rows) {
    const encrypted = encryptedChannelCredentialValues(channel.credentials);
    await pool.query(
      `
        update channels
        set credentials = $2,
            encrypted_credentials = $3,
            credentials_encryption_nonce = $4,
            credentials_encryption_tag = $5,
            updated_at = now()
        where id = $1
      `,
      [
        channel.id,
        encrypted.credentials,
        encrypted.encryptedCredentials,
        encrypted.nonce,
        encrypted.tag,
      ],
    );
    console.log(
      JSON.stringify({
        event: "channel_credentials.encrypted",
        channelId: channel.id,
        clientId: channel.client_id,
        kind: channel.kind,
      }),
    );
  }

  console.log(
    JSON.stringify({
      event: "channel_credentials.encryption_completed",
      encryptedCount: rows.rowCount ?? rows.rows.length,
    }),
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
