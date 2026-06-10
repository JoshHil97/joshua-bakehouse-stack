// functions/favourites.js

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

// CDK sets these via lambdaEnvVars
const TABLE_NAME = process.env.FAVOURITES_TABLE_NAME;
const REGION = process.env.DYNAMO_REGION;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  body: JSON.stringify(body)
});

const parseBody = (event) => {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
};

const normaliseEmail = (email) => String(email || "").trim().toLowerCase();
const normaliseProductId = (productId) => String(productId || "").trim();

// POST /api/favourites
// Body: { email, productId }
// Adds a favourite (idempotent: calling again just overwrites same item)
export const postFavouritesHandler = async (event) => {
  console.log("event:", JSON.stringify(event));
  console.log("body:", event.body);
  try {
    if (!TABLE_NAME) return jsonResponse(500, { status: "error", message: "Missing FAVOURITES_TABLE_NAME" });
    if (!REGION) return jsonResponse(500, { status: "error", message: "Missing DYNAMO_REGION" });

    const body = parseBody(event);
    const email = normaliseEmail(body.email);
    const productId = normaliseProductId(body.productId);

    if (!email || !productId) {
      return jsonResponse(400, { status: "error", message: "Email and productId are required" });
    }

    const item = {
      email,
      productId,
      createdAt: new Date().toISOString()
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      })
    );

    return jsonResponse(201, {
      status: "favourited",
      favourite: item
    });
  } catch (err) {
    console.error("postFavouritesHandler error:", err);
    return jsonResponse(500, { status: "error", message: "Could not favourite product" });
  }
};

// GET /api/favourites?email=...
// Returns all favourites for a user using Query on the partition key
export const getFavouritesHandler = async (event) => {
  console.log("event:", JSON.stringify(event));
  console.log("body:", event.body);
  try {
    if (!TABLE_NAME) return jsonResponse(500, { status: "error", message: "Missing FAVOURITES_TABLE_NAME" });
    if (!REGION) return jsonResponse(500, { status: "error", message: "Missing DYNAMO_REGION" });

    const email = normaliseEmail(event?.queryStringParameters?.email);

    if (!email) {
      return jsonResponse(400, { status: "error", message: "Missing email query parameter" });
    }

    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#email = :email",
        ExpressionAttributeNames: { "#email": "email" },
        ExpressionAttributeValues: { ":email": email }
      })
    );

    const favourites = result?.Items || [];

    return jsonResponse(200, {
      status: "ok",
      email,
      count: favourites.length,
      favourites
    });
  } catch (err) {
    console.error("getFavouritesHandler error:", err);
    return jsonResponse(500, { status: "error", message: "Could not load favourites" });
  }
};

// DELETE /api/favourites
// Body: { email, productId }
// Removes a favourite if it exists
export const deleteFavouritesHandler = async (event) => {
  console.log("event:", JSON.stringify(event));
  console.log("body:", event.body);
  try {
    if (!TABLE_NAME) return jsonResponse(500, { status: "error", message: "Missing FAVOURITES_TABLE_NAME" });
    if (!REGION) return jsonResponse(500, { status: "error", message: "Missing DYNAMO_REGION" });

    const body = parseBody(event);
    const email = normaliseEmail(body.email);
    const productId = normaliseProductId(body.productId);

    if (!email || !productId) {
      return jsonResponse(400, { status: "error", message: "Email and productId are required" });
    }

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { email, productId }
      })
    );

    return jsonResponse(200, {
      status: "unfavourited",
      email,
      productId
    });
  } catch (err) {
    console.error("deleteFavouritesHandler error:", err);
    return jsonResponse(500, { status: "error", message: "Could not unfavourite product" });
  }
};
