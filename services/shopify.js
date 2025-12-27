require('dotenv').config();

class ShopifyService {
  constructor() {
    this.shopName = process.env.SHOPIFY_SHOP_NAME;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
    
    // 環境変数のバリデーション
    if (!this.shopName) {
      throw new Error('SHOPIFY_SHOP_NAME environment variable is not set. Please add it to your .env file.');
    }
    if (!this.accessToken) {
      throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is not set. Please add it to your .env file.');
    }
    
    this.baseUrl = `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  // Shopify Admin APIを呼び出す
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken
      }
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, mergedOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Shopify API request failed:', error);
      throw error;
    }
  }

  // 特定のタグを持つ顧客を取得
  async getCustomersByTag(tag, limit = 250) {
    try {
      const allCustomers = [];
      let pageInfo = null;
      let hasNextPage = true;

      while (hasNextPage) {
        // GraphQL クエリを使用してタグでフィルタリング
        const query = `
          query getCustomers($query: String!, $first: Int!, $after: String) {
            customers(first: $first, query: $query, after: $after) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  phone
                  tags
                  createdAt
                  updatedAt
                  addresses {
                    address1
                    address2
                    city
                    province
                    zip
                    country
                  }
                  metafields(first: 100) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const variables = {
          query: `tag:${tag}`,
          first: Math.min(limit, 250), // Shopifyの制限は250
          after: pageInfo
        };

        const response = await this.makeRequest('/graphql.json', {
          method: 'POST',
          body: JSON.stringify({ query, variables })
        });

        if (response.data && response.data.customers) {
          const customers = response.data.customers.edges.map(edge => edge.node);
          allCustomers.push(...customers);

          const { hasNextPage: hasNext, endCursor } = response.data.customers.pageInfo;
          hasNextPage = hasNext && allCustomers.length < limit;
          pageInfo = endCursor;
        } else {
          hasNextPage = false;
        }
      }

      return allCustomers;
    } catch (error) {
      console.error('Error fetching customers by tag:', error);
      throw error;
    }
  }

  // 顧客データをスプレッドシート形式に変換
  formatCustomerForSheet(customer) {
    // Shopify IDからgid://部分を削除して数値IDを取得
    const shopifyId = customer.id.replace('gid://shopify/Customer/', '');

    // metafieldsをオブジェクト形式に変換
    const metafields = {};
    if (customer.metafields && customer.metafields.edges) {
      customer.metafields.edges.forEach(edge => {
        const { namespace, key, value, type } = edge.node;
        const metafieldKey = `${namespace}.${key}`;
        metafields[metafieldKey] = value;
      });
    }

    return {
      shopify_id: shopifyId,
      email: customer.email || '',
      first_name: customer.firstName || '',
      last_name: customer.lastName || '',
      phone: customer.phone || '',
      tags: customer.tags.join(', '),
      address1: customer.addresses[0]?.address1 || '',
      address2: customer.addresses[0]?.address2 || '',
      city: customer.addresses[0]?.city || '',
      province: customer.addresses[0]?.province || '',
      zip: customer.addresses[0]?.zip || '',
      country: customer.addresses[0]?.country || '',
      created_at: customer.createdAt || '',
      updated_at: customer.updatedAt || '',
      // metafieldsを個別のフィールドとして展開（"custom."プレフィックスを除去）
      fwj_effectivedate: metafields['custom.fwj_effectivedate'] || '',
      fwj_birthday: metafields['custom.fwj_birthday'] || '',
      fwj_card_no: metafields['custom.fwj_card_no'] || '',
      fwj_nationality: metafields['custom.fwj_nationality'] || '',
      fwj_sex: metafields['custom.fwj_sex'] || '',
      fwj_firstname: metafields['custom.fwj_firstname'] || '',
      fwj_lastname: metafields['custom.fwj_lastname'] || '',
      fwj_kanafirstname: metafields['custom.fwj_kanafirstname'] || '',
      fwj_kanalastname: metafields['custom.fwj_kanalastname'] || ''
    };
  }
}

module.exports = ShopifyService;
