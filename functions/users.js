// functions/users.js
//
// Two Lambdas live in this file:
//
// 1) postUsersHandler  -> POST /api/users  (sign up)
// 2) loginHandler      -> POST /api/login  (log in)
//
// We store users in DynamoDB using `email` as the partition key.
// We NEVER store a raw password. We store a salted hash instead.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand
} from "@aws-sdk/lib-dynamodb"
import crypto from "crypto"

// CDK passes these in as Lambda environment variables
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME
const REGION = process.env.DYNAMO_REGION

// DocumentClient lets us read and write normal JavaScript objects.
// Without it, DynamoDB uses a more verbose AttributeValue format.
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
)

// Standard JSON response helper for API Gateway
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  body: JSON.stringify(body)
})

/**
 * hashPassword(password, salt?)
 *
 * Goal:
 * - Turn a password into a hash that we can safely store.
 *
 * Why we need a salt:
 * - If two users pick the same password, their hashes should still be different.
 * - The salt is random per user, so the final hash changes even for same password.
 *
 * pbkdf2:
 * - A "slow" hashing function designed for passwords.
 * - Slowness is good here: it makes brute force guessing harder.
 *
 * What we store:
 * - salt: needed to re hash later during login
 * - hash: the result
 * - iterations + digest: the settings we used, so we can repeat them later
 */
const hashPassword = (
  password,
  salt = crypto.randomBytes(16).toString("hex") // random per user
) => {
  const iterations = 100_000 // how many rounds of hashing
  const keylen = 64 // output length in bytes
  const digest = "sha512" // hash algorithm used internally by pbkdf2

  // pbkdf2Sync returns raw bytes, we convert to a hex string for storage
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, keylen, digest)
    .toString("hex")

  return { salt, hash, iterations, digest }
}


/**
 * verifyPassword(password, stored)
 *
 * Goal:
 * - Check whether the password the user typed produces the same hash as the stored one.
 *
 * How:
 * - Re hash the candidate password using the SAME salt and settings we stored.
 * - Compare the newly produced hash vs the stored hash.
 *
 * timingSafeEqual:
 * - Avoids leaking tiny timing differences during comparison.
 * - This is a small security hardening step.
 */
const verifyPassword = (password, stored) => {
  const { salt, hash, iterations, digest } = stored

  // Re create the hash using the original salt + settings
  const candidate = crypto
    .pbkdf2Sync(password, salt, iterations, 64, digest)
    .toString("hex")

  // Compare both hashes safely
  return crypto.timingSafeEqual(
    Buffer.from(candidate, "hex"),
    Buffer.from(hash, "hex")
  )
}

// ------------------------------------------------------------
// POST /api/users  (Sign up)
// ------------------------------------------------------------
export const postUsersHandler = async (event) => {
  try {
    // If env vars are missing, we cannot talk to DynamoDB
    if (!TABLE_NAME) {
      return jsonResponse(500, { status: "error", message: "Missing DYNAMO_TABLE_NAME" })
    }
    if (!REGION) {
      return jsonResponse(500, { status: "error", message: "Missing DYNAMO_REGION" })
    }

    // API Gateway gives us the request body as a string
    const body = event.body ? JSON.parse(event.body) : {}

    // Normalise email so log in is consistent
    const email = body.email?.trim()?.toLowerCase()
    const password = body.password

    // Basic validation
    if (!email || !password) {
      return jsonResponse(400, { status: "error", message: "Email and password are required" })
    }

    // 1) Check if the user already exists (read by primary key)
    // This is why postUsersLambda needs READ permission too.
    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { email } // Key must match the table partition key name
      })
    )

    if (existing.Item) {
      return jsonResponse(409, { status: "error", message: "User already exists" })
    }

    // 2) Convert the raw password into a salted hash for storage
    const passwordData = hashPassword(password)

    // 3) Store the new user item in DynamoDB
    // Email is the partition key, so it uniquely identifies the item.
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          email,
          password: passwordData, // store salt + hash, never raw password
          createdAt: new Date().toISOString()
        },
        // Extra safety: prevents overwriting if a user appears between Get and Put
        ConditionExpression: "attribute_not_exists(email)"
      })
    )

    // Respond with safe data only (never return password fields)
    return jsonResponse(201, {
      status: "created",
      user: { email }
    })
  } catch (err) {
    // If the conditional write failed, the user already exists
    if (err?.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, { status: "error", message: "User already exists" })
    }

    console.error("postUsersHandler error:", err)
    return jsonResponse(500, { status: "error", message: "Could not create user" })
  }
}

// ------------------------------------------------------------
// POST /api/login  (Log in)
// ------------------------------------------------------------
export const loginHandler = async (event) => {
  try {
    if (!TABLE_NAME) {
      return jsonResponse(500, { status: "error", message: "Missing DYNAMO_TABLE_NAME" })
    }
    if (!REGION) {
      return jsonResponse(500, { status: "error", message: "Missing DYNAMO_REGION" })
    }

    const body = event.body ? JSON.parse(event.body) : {}
    const email = body.email?.trim()?.toLowerCase()
    const password = body.password

    if (!email || !password) {
      return jsonResponse(400, { status: "error", message: "Email and password are required" })
    }

    // 1) Fetch the user by primary key (fast, direct lookup)
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { email }
      })
    )

    const user = result.Item

    // Keep response generic so we do not reveal whether an email exists
    if (!user) {
      return jsonResponse(401, { status: "error", message: "Invalid email or password" })
    }

    // 2) Re hash the supplied password and compare to stored hash
    const ok = verifyPassword(password, user.password)
    if (!ok) {
      return jsonResponse(401, { status: "error", message: "Invalid email or password" })
    }

    // For this lesson we return a simple success.
    // Next step would be issuing a token or creating a session record.
    return jsonResponse(200, {
      status: "logged_in",
      user: { email }
    })
  } catch (err) {
    console.error("loginHandler error:", err)
    return jsonResponse(500, { status: "error", message: "Could not log in" })
  }
}
