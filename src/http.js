const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// Shared HTTP client with retry for download operations
const httpClient = axios.create({
  headers: { 'User-Agent': 'RetroChallenges-App/1.0' }
});

axiosRetry(httpClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500);
  }
});

module.exports = { httpClient };
