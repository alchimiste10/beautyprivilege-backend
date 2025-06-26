const { docClient, dynamoConfig } = require('../config/awsConfig');

/**
 * Récupère les informations complètes d'un stylist par son userId
 * @param {string} userId - L'ID de l'utilisateur (stylistId)
 * @returns {Promise<Object|null>} - Les informations du stylist et de l'utilisateur
 */
async function getStylistInfo(userId) {
    try {
        if (!userId) {
            console.warn('getStylistInfo: userId manquant');
            return null;
        }

        // Récupérer le stylist par userId
        const stylistResult = await docClient.query({
            TableName: dynamoConfig.tables.stylist,
            IndexName: 'byUser',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        }).promise();

        console.log('getStylistInfo: Résultat query stylist:', stylistResult.Items ? stylistResult.Items.length : 0, 'items');

        if (!stylistResult.Items || stylistResult.Items.length === 0) {
            console.warn(`getStylistInfo: Aucun stylist trouvé pour userId: ${userId}`);
            return null;
        }

        const stylist = stylistResult.Items[0];
        console.log('getStylistInfo: Stylist trouvé:', stylist.id);

        // Récupérer les informations de l'utilisateur
        const userResult = await docClient.get({
            TableName: dynamoConfig.tables.user,
            Key: { id: stylist.userId }
        }).promise();

        const user = userResult.Item;

        if (!user) {
            console.warn(`getStylistInfo: Utilisateur non trouvé pour stylist: ${stylist.id}`);
            return null;
        }

        // Construire l'objet de retour
        const stylistInfo = {
            stylist: {
                id: stylist.id,
                userId: stylist.userId,
                salonId: stylist.salonId,
                specialties: stylist.specialties || [],
                bio: stylist.bio || '',
                experience: stylist.experience || 0,
                pseudo: stylist.pseudo || '',
                address: stylist.address || '',
                city: stylist.city || '',
                postalCode: stylist.postalCode || '',
                country: stylist.country || '',
                profileImage: stylist.profileImage || '',
                workPhotos: stylist.workPhotos || [],
                rating: stylist.rating || 0,
                createdAt: stylist.createdAt,
                updatedAt: stylist.updatedAt
            },
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                phone: user.phone || '',
                profileImage: user.profileImage || '',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            // Propriétés calculées pour faciliter l'utilisation
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || stylist.pseudo || 'Professionnel',
            fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            profileImage: stylist.profileImage || user.profileImage || null
        };

        return stylistInfo;

    } catch (error) {
        console.error('getStylistInfo: Erreur lors de la récupération du stylist:', error);
        return null;
    }
}

/**
 * Récupère uniquement le nom d'affichage du stylist
 * @param {string} userId - L'ID de l'utilisateur (stylistId)
 * @returns {Promise<string>} - Le nom d'affichage du stylist
 */
async function getStylistDisplayName(userId) {
    try {
        const stylistInfo = await getStylistInfo(userId);
        return stylistInfo ? stylistInfo.displayName : 'Professionnel';
    } catch (error) {
        console.error('getStylistDisplayName: Erreur:', error);
        return 'Professionnel';
    }
}

/**
 * Récupère l'image de profil du stylist
 * @param {string} userId - L'ID de l'utilisateur (stylistId)
 * @returns {Promise<string|null>} - L'URL de l'image de profil
 */
async function getStylistProfileImage(userId) {
    try {
        const stylistInfo = await getStylistInfo(userId);
        return stylistInfo ? stylistInfo.profileImage : null;
    } catch (error) {
        console.error('getStylistProfileImage: Erreur:', error);
        return null;
    }
}

/**
 * Vérifie si un stylist existe
 * @param {string} userId - L'ID de l'utilisateur (stylistId)
 * @returns {Promise<boolean>} - True si le stylist existe
 */
async function stylistExists(userId) {
    try {
        const stylistInfo = await getStylistInfo(userId);
        return stylistInfo !== null;
    } catch (error) {
        console.error('stylistExists: Erreur:', error);
        return false;
    }
}

module.exports = {
    getStylistInfo,
    getStylistDisplayName,
    getStylistProfileImage,
    stylistExists
}; 