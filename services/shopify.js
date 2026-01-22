require('dotenv').config();

class ShopifyService {
  constructor() {
    this.shopName = process.env.SHOPIFY_SHOP_NAME;
    this.accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
    
    // 環境変数のバリデーション
    if (!this.shopName) {
      throw new Error('SHOPIFY_SHOP_NAME environment variable is not set. Please add it to your .env file.');
    }
    if (!this.accessToken) {
      throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN environment variable is not set. Please add it to your .env file.');
    }
    
    this.baseUrl = `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  // Shopify Admin APIを呼び出す
  async makeRequest(endpoint, options = {}, retries = 3) {
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
      },
      signal: AbortSignal.timeout(60000) // 60秒タイムアウト
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Shopify API request attempt ${attempt}/${retries}: ${endpoint}`);
        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`Shopify API request failed (attempt ${attempt}/${retries}):`, error.message);
        
        if (attempt === retries) {
          throw error;
        }
        
        // リトライ前に待機（指数バックオフ）
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
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
      fwj_kanalastname: metafields['custom.fwj_kanalastname'] || '',
      fwj_height: metafields['custom.fwj_height'] || '',
      fwj_weight: metafields['custom.fwj_weight'] || ''
    };
  }


  // 特定のタグを持つ注文を取得

  // タグ入力をパースして配列に変換
  // - カンマまたはスペースで区切り
  // - 引用符（"または'）で囲まれた部分は1つのタグとして扱う
  parseTags(input) {
    const tags = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuote) {
        // 引用符開始
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        // 引用符終了
        inQuote = false;
        quoteChar = '';
      } else if ((char === ',' || char === ' ') && !inQuote) {
        // 区切り文字（引用符外）
        if (current.trim()) {
          tags.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    // 最後のタグを追加
    if (current.trim()) {
      tags.push(current.trim());
    }

    return tags;
  }

  async getOrdersByTag(tagInput, limit = 0, paidOnly = true) {
    try {
      const allOrders = [];
      let pageInfo = null;
      let hasNextPage = true;
      let pageCount = 0;

      // タグをパースして配列に変換（空の場合は空配列）
      const tags = tagInput ? this.parseTags(tagInput) : [];
      
      // 各タグをエスケープしてクエリを構築（AND検索）
      let tagQueries = '';
      if (tags.length > 0) {
        tagQueries = tags.map(t => {
          const escapedTag = t.includes(' ') || t.includes(':') ? `"${t}"` : t;
          return `tag:${escapedTag}`;
        }).join(' ') + ' ';
      }
      
      // paidOnlyがtrueの場合は支払い済み、オープン状態、キャンセルされていない注文のみ取得
      // paidOnlyがfalseの場合は全ての支払い状態・オープン状態・キャンセル状態を含む
      let searchQuery = tagQueries.trim();
      if (paidOnly) {
        searchQuery = `${tagQueries}financial_status:paid status:open -status:cancelled`;
      }
      
      console.log(`Parsed tags: ${JSON.stringify(tags)}`);
      
      // limit=0 は無制限を意味する
      const isUnlimited = limit === 0;
      
      console.log(`Shopify order search query: ${searchQuery}, limit: ${isUnlimited ? 'unlimited' : limit}`);

      while (hasNextPage) {
        pageCount++;
        const query = `
          query getOrders($query: String!, $first: Int!, $after: String) {
            orders(first: $first, query: $query, after: $after) {
              edges {
                node {
                  id
                  name
                  createdAt
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  displayFinancialStatus
                  displayFulfillmentStatus
                  tags
                  customer {
                    id
                    email
                    firstName
                    lastName
                  }
                  lineItems(first: 100) {
                    edges {
                      node {
                        title
                        variantTitle
                        quantity
                        currentQuantity
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        product {
                          tags
                        }
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

        // 1回のリクエストで最大250件取得（Shopifyの制限）
        const batchSize = isUnlimited ? 250 : Math.min(limit - allOrders.length, 250);

        const variables = {
          query: searchQuery,
          first: batchSize,
          after: pageInfo
        };

        console.log(`Shopify API call #${pageCount}, fetching up to ${batchSize} orders...`);

        const response = await this.makeRequest('/graphql.json', {
          method: 'POST',
          body: JSON.stringify({ query, variables })
        });

        // GraphQLエラーをチェック
        if (response.errors) {
          console.error('Shopify GraphQL errors:', JSON.stringify(response.errors, null, 2));
          throw new Error(`Shopify GraphQL error: ${response.errors.map(e => e.message).join(', ')}`);
        }

        const ordersInBatch = response.data?.orders?.edges?.length || 0;
        console.log(`Shopify API call #${pageCount} received ${ordersInBatch} orders`);

        if (response.data && response.data.orders) {
          const orders = response.data.orders.edges.map(edge => edge.node);
          allOrders.push(...orders);

          const { hasNextPage: hasNext, endCursor } = response.data.orders.pageInfo;
          
          // 無制限の場合は次のページがある限り続ける、制限ありの場合は制限に達したら止める
          hasNextPage = hasNext && (isUnlimited || allOrders.length < limit);
          pageInfo = endCursor;
          
          console.log(`Total orders fetched so far: ${allOrders.length}, hasNextPage: ${hasNextPage}`);
        } else {
          console.log('No orders data in response:', JSON.stringify(response, null, 2));
          hasNextPage = false;
        }
      }

      console.log(`Shopify order fetch completed: ${allOrders.length} orders in ${pageCount} API calls`);
      return allOrders;
    } catch (error) {
      console.error('Error fetching orders by tag:', error);
      throw error;
    }
  }

  // 注文データをスプレッドシート形式に変換（1注文が複数行になる可能性あり）
  formatOrderForSheet(order) {
    const orderId = order.id.replace('gid://shopify/Order/', '');
    const orderName = order.name || '';
    const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('ja-JP') : '';
    const customerId = order.customer?.id?.replace('gid://shopify/Customer/', '') || '';
    const customerName = order.customer
      ? `${order.customer.lastName || ''} ${order.customer.firstName || ''}`.trim()
      : '';
    const customerEmail = order.customer?.email || '';
    const totalPrice = order.totalPriceSet?.shopMoney?.amount || '';
    const financialStatus = this.translateFinancialStatus(order.displayFinancialStatus);
    const fulfillmentStatus = this.translateFulfillmentStatus(order.displayFulfillmentStatus);

    const lineItems = order.lineItems?.edges || [];

    if (lineItems.length === 0) {
      // 商品がない場合は1行（タグは空配列）
      return [{
        baseData: [
          orderName,
          createdAt,
          customerId,
          customerName,
          customerEmail,
          totalPrice,
          financialStatus,
          fulfillmentStatus,
          '', // 商品名
          '', // バリエーション
          '', // 数量
          ''  // 単価
        ],
        tags: []
      }];
    }

    // 商品ごとに行を展開（削除済み商品を除外）
    return lineItems
      .map(edge => edge.node)
      .filter(item => {
        // currentQuantity が 0 の商品（削除済み）を除外
        const qty = item.currentQuantity ?? item.quantity;
        return qty > 0;
      })
      .map(item => {
        const productTags = item.product?.tags || [];
        return {
          baseData: [
            orderName,
            createdAt,
            customerId,
            customerName,
            customerEmail,
            totalPrice,
            financialStatus,
            fulfillmentStatus,
            item.title || '',
            item.variantTitle || '',
            item.currentQuantity ?? item.quantity ?? '',  // 編集後の数量を使用
            item.originalUnitPriceSet?.shopMoney?.amount || ''
          ],
          tags: productTags
        };
      });
  }

  // 支払いステータスを日本語に変換
  translateFinancialStatus(status) {
    const statusMap = {
      'PENDING': '保留中',
      'AUTHORIZED': '承認済み',
      'PARTIALLY_PAID': '一部支払い済み',
      'PAID': '支払い済み',
      'PARTIALLY_REFUNDED': '一部返金済み',
      'REFUNDED': '返金済み',
      'VOIDED': '無効'
    };
    return statusMap[status] || status || '';
  }

  // 発送ステータスを日本語に変換
  translateFulfillmentStatus(status) {
    const statusMap = {
      'UNFULFILLED': '未発送',
      'PARTIALLY_FULFILLED': '一部発送済み',
      'FULFILLED': '発送済み',
      'RESTOCKED': '在庫戻し',
      'PENDING_FULFILLMENT': '発送待ち',
      'OPEN': 'オープン',
      'IN_PROGRESS': '処理中',
      'ON_HOLD': '保留',
      'SCHEDULED': '予約済み'
    };
    return statusMap[status] || status || '';
  }
}

module.exports = ShopifyService;
