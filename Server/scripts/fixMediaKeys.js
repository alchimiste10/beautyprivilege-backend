const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.POST_TABLE_NAME || 'Post-ecbqin3qw5h5jghkqsi5d7qrza-dev';

async function fixMediaKeys() {
  try {
    console.log('=== FIXING MEDIA KEYS ===');
    console.log('Table:', TABLE_NAME);
    
    // Récupérer tous les posts
    const { Items: posts } = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));

    console.log(`Found ${posts.length} posts`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const post of posts) {
      if (post.media && post.media.key) {
        const originalKey = post.media.key;
        
        // Vérifier si la clé a besoin d'être corrigée
        if (!originalKey.startsWith('public/')) {
          const newKey = `public/${originalKey}`;
          
          console.log(`Fixing post ${post.id}:`);
          console.log(`  Old key: ${originalKey}`);
          console.log(`  New key: ${newKey}`);
          
          // Mettre à jour la clé
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: post.id },
            UpdateExpression: 'SET media.key = :newKey',
            ExpressionAttributeValues: {
              ':newKey': newKey
            }
          }));
          
          fixedCount++;
        } else {
          console.log(`Post ${post.id}: Key already correct (${originalKey})`);
          skippedCount++;
        }
      } else {
        console.log(`Post ${post.id}: No media`);
        skippedCount++;
      }
    }

    console.log('=== SUMMARY ===');
    console.log(`Fixed: ${fixedCount} posts`);
    console.log(`Skipped: ${skippedCount} posts`);
    console.log('================');

  } catch (error) {
    console.error('Error fixing media keys:', error);
  }
}

// Exécuter le script
fixMediaKeys(); 