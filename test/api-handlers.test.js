import { jest } from '@jest/globals'

const sendMock = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}))

jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: sendMock }))
  },
  DeleteCommand: class DeleteCommand {
    constructor (input) {
      this.input = input
    }
  },
  GetCommand: class GetCommand {
    constructor (input) {
      this.input = input
    }
  },
  PutCommand: class PutCommand {
    constructor (input) {
      this.input = input
    }
  },
  QueryCommand: class QueryCommand {
    constructor (input) {
      this.input = input
    }
  }
}))

beforeEach(() => {
  sendMock.mockReset()
  process.env.DYNAMO_REGION = 'eu-west-2'
  process.env.DYNAMO_TABLE_NAME = 'users-table'
  process.env.FAVOURITES_TABLE_NAME = 'favourites-table'
})

test('healthcheck returns ok', async () => {
  const { healthcheckHandler } = await import('../functions/health-check.js')

  const response = await healthcheckHandler()

  expect(response.statusCode).toBe(200)
  expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
})

test('postFavouritesHandler normalises and stores a favourite', async () => {
  const { postFavouritesHandler } = await import('../functions/favourites.js')
  sendMock.mockResolvedValueOnce({})

  const response = await postFavouritesHandler({
    body: JSON.stringify({
      email: '  TEST@Example.COM ',
      productId: ' cinnamon_bun '
    })
  })

  expect(response.statusCode).toBe(201)
  expect(sendMock).toHaveBeenCalledTimes(1)
  expect(sendMock.mock.calls[0][0].input).toMatchObject({
    TableName: 'favourites-table',
    Item: {
      email: 'test@example.com',
      productId: 'cinnamon_bun'
    }
  })
})

test('getFavouritesHandler requires an email query parameter', async () => {
  const { getFavouritesHandler } = await import('../functions/favourites.js')

  const response = await getFavouritesHandler({ queryStringParameters: {} })

  expect(response.statusCode).toBe(400)
  expect(JSON.parse(response.body).message).toMatch(/email/i)
})

test('signup stores a password hash and login verifies it', async () => {
  const { postUsersHandler, loginHandler } = await import('../functions/users.js')
  sendMock.mockResolvedValueOnce({})
  sendMock.mockResolvedValueOnce({})

  const signupResponse = await postUsersHandler({
    body: JSON.stringify({
      email: ' NewUser@Example.com ',
      password: 'correct-password'
    })
  })

  expect(signupResponse.statusCode).toBe(201)

  const putInput = sendMock.mock.calls[1][0].input
  expect(putInput.TableName).toBe('users-table')
  expect(putInput.Item.email).toBe('newuser@example.com')
  expect(putInput.Item.password.hash).toBeTruthy()
  expect(putInput.Item.password.hash).not.toBe('correct-password')

  sendMock.mockReset()
  sendMock.mockResolvedValueOnce({ Item: putInput.Item })

  const loginResponse = await loginHandler({
    body: JSON.stringify({
      email: 'newuser@example.com',
      password: 'correct-password'
    })
  })

  expect(loginResponse.statusCode).toBe(200)
  expect(JSON.parse(loginResponse.body).user).toEqual({
    email: 'newuser@example.com'
  })
})
