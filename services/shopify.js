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
                        id
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
    const createdAt = order.createdAt ? this.formatDateTimeForDb(new Date(order.createdAt)) : '';
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
          '', // 現在数量
          '', // 単価
          ''  // line_item_id
        ],
        tags: []
      }];
    }

    // 商品ごとに行を展開（削除済み商品も含む）
    return lineItems
      .map(edge => edge.node)
      .map(item => {
        const productTags = item.product?.tags || [];
        // line_item_id を GID から数値部分のみ抽出
        const lineItemId = item.id ? item.id.replace('gid://shopify/LineItem/', '') : '';
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
            item.quantity ?? '',           // 元の数量
            item.currentQuantity ?? '',    // 現在の数量
            item.originalUnitPriceSet?.shopMoney?.amount || '',
            lineItemId                     // line_item_id
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


  /**
   * DateオブジェクトをYYYY-MM-DD HH:mm:SS形式の文字列に変換
   * @param {Date} date - 変換する日付
   * @returns {string} フォーマットされた日時文字列
   */
  formatDateTimeForDb(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }


  /**
   * LineItem の currentQuantity をデクリメントする
   * @param {string} orderId - 注文ID（数値部分のみ、または gid://shopify/Order/xxx 形式）
   * @param {string} lineItemId - LineItem ID（数値部分のみ、または gid://shopify/LineItem/xxx 形式）
   * @param {number} decrementBy - 減少させる数量（デフォルト: 1）
   * @returns {Promise<object>} - 更新結果
   */
  async decrementLineItemQuantity(orderId, lineItemId, decrementBy = 1) {
    try {
      // GID形式に変換
      const orderGid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;
      const lineItemGid = lineItemId.startsWith('gid://') ? lineItemId : `gid://shopify/LineItem/${lineItemId}`;

      console.log(`Starting order edit for order: ${orderGid}, lineItem: ${lineItemGid}, decrementBy: ${decrementBy}`);

      // Step 1: orderEditBegin - 編集セッションを開始
      const beginQuery = `
        mutation orderEditBegin($id: ID!) {
          orderEditBegin(id: $id) {
            calculatedOrder {
              id
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    calculatedLineItem {
                      id
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const beginResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: beginQuery,
          variables: { id: orderGid }
        })
      });

      if (beginResponse.errors) {
        throw new Error(`GraphQL error: ${beginResponse.errors.map(e => e.message).join(', ')}`);
      }

      const beginResult = beginResponse.data?.orderEditBegin;
      if (beginResult?.userErrors?.length > 0) {
        throw new Error(`Order edit begin error: ${beginResult.userErrors.map(e => e.message).join(', ')}`);
      }

      const calculatedOrder = beginResult?.calculatedOrder;
      if (!calculatedOrder) {
        throw new Error('Failed to begin order edit: no calculatedOrder returned');
      }

      // LineItem に対応する CalculatedLineItem を探す
      const lineItemEdge = calculatedOrder.lineItems.edges.find(edge => edge.node.id === lineItemGid);
      if (!lineItemEdge) {
        throw new Error(`LineItem not found: ${lineItemGid}`);
      }

      const currentQuantity = lineItemEdge.node.quantity;
      const calculatedLineItemId = lineItemEdge.node.calculatedLineItem?.id;

      if (!calculatedLineItemId) {
        throw new Error(`CalculatedLineItem not found for LineItem: ${lineItemGid}`);
      }

      const newQuantity = Math.max(0, currentQuantity - decrementBy);

      console.log(`Current quantity: ${currentQuantity}, new quantity: ${newQuantity}`);

      // Step 2: orderEditSetQuantity - 数量を変更
      const setQuantityQuery = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const setQuantityResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: setQuantityQuery,
          variables: {
            id: calculatedOrder.id,
            lineItemId: calculatedLineItemId,
            quantity: newQuantity
          }
        })
      });

      if (setQuantityResponse.errors) {
        throw new Error(`GraphQL error: ${setQuantityResponse.errors.map(e => e.message).join(', ')}`);
      }

      const setQuantityResult = setQuantityResponse.data?.orderEditSetQuantity;
      if (setQuantityResult?.userErrors?.length > 0) {
        throw new Error(`Set quantity error: ${setQuantityResult.userErrors.map(e => e.message).join(', ')}`);
      }

      // Step 3: orderEditCommit - 変更をコミット
      const commitQuery = `
        mutation orderEditCommit($id: ID!) {
          orderEditCommit(id: $id, notifyCustomer: false) {
            order {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const commitResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: commitQuery,
          variables: { id: calculatedOrder.id }
        })
      });

      if (commitResponse.errors) {
        throw new Error(`GraphQL error: ${commitResponse.errors.map(e => e.message).join(', ')}`);
      }

      const commitResult = commitResponse.data?.orderEditCommit;
      if (commitResult?.userErrors?.length > 0) {
        throw new Error(`Commit error: ${commitResult.userErrors.map(e => e.message).join(', ')}`);
      }

      console.log(`Successfully decremented LineItem ${lineItemId} quantity from ${currentQuantity} to ${newQuantity}`);

      return {
        success: true,
        orderId: orderId,
        lineItemId: lineItemId,
        previousQuantity: currentQuantity,
        newQuantity: newQuantity,
        decrementedBy: decrementBy
      };

    } catch (error) {
      console.error('Error decrementing LineItem quantity:', error);
      throw error;
    }
  }

  /**
   * チェックイン処理（注文情報取得 + 数量デクリメント）
   * @param {string} orderId 
   * @param {string} lineItemId 
   * @returns {Promise<{orderName: string, productName: string, variantTitle: string, previousQuantity: number, newQuantity: number}>}
   */
  async checkinLineItem(orderId, lineItemId, decrementBy = 1) {
    try {
      // GID形式に変換
      const orderGid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;
      const lineItemGid = lineItemId.startsWith('gid://') ? lineItemId : `gid://shopify/LineItem/${lineItemId}`;

      console.log(`Checkin for order: ${orderGid}, lineItem: ${lineItemGid}, decrementBy: ${decrementBy}`);

      // Step 1: まず注文情報を取得して、LineItem の variant ID を取得
      const orderQuery = `
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            name
            lineItems(first: 100) {
              edges {
                node {
                  id
                  quantity
                  title
                  variantTitle
                  variant {
                    id
                  }
                }
              }
            }
          }
        }
      `;

      const orderResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: orderQuery,
          variables: { id: orderGid }
        })
      });

      if (orderResponse.errors) {
        throw new Error(`GraphQL error: ${orderResponse.errors.map(e => e.message).join(', ')}`);
      }

      const order = orderResponse.data?.order;
      if (!order) {
        throw new Error('注文が見つかりません');
      }

      // 元の LineItem を見つける
      const originalLineItem = order.lineItems.edges.find(edge => edge.node.id === lineItemGid);
      if (!originalLineItem) {
        throw new Error(`商品が見つかりません: ${lineItemGid}`);
      }

      const originalNode = originalLineItem.node;
      const variantId = originalNode.variant?.id;
      const productName = originalNode.title || '商品名不明';
      const variantTitle = originalNode.variantTitle || '';

      console.log(`Found LineItem: ${productName} (variant: ${variantId})`);

      // Step 2: orderEditBegin - 編集セッションを開始
      const beginQuery = `
        mutation orderEditBegin($id: ID!) {
          orderEditBegin(id: $id) {
            calculatedOrder {
              id
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    title
                    variantTitle
                    variant {
                      id
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const beginResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: beginQuery,
          variables: { id: orderGid }
        })
      });

      if (beginResponse.errors) {
        throw new Error(`GraphQL error: ${beginResponse.errors.map(e => e.message).join(', ')}`);
      }

      const beginResult = beginResponse.data?.orderEditBegin;
      if (beginResult?.userErrors?.length > 0) {
        throw new Error(`Order edit begin error: ${beginResult.userErrors.map(e => e.message).join(', ')}`);
      }

      const calculatedOrder = beginResult?.calculatedOrder;
      if (!calculatedOrder) {
        throw new Error('編集セッションを開始できません');
      }

      // variant ID でマッチングして CalculatedLineItem を探す
      let calcLineItemEdge;
      if (variantId) {
        calcLineItemEdge = calculatedOrder.lineItems.edges.find(
          edge => edge.node.variant?.id === variantId
        );
      }
      
      // variant ID でマッチしない場合は title と variantTitle でマッチ
      if (!calcLineItemEdge) {
        calcLineItemEdge = calculatedOrder.lineItems.edges.find(
          edge => edge.node.title === productName && edge.node.variantTitle === variantTitle
        );
      }

      if (!calcLineItemEdge) {
        throw new Error(`CalculatedLineItem が見つかりません`);
      }

      const calcLineItem = calcLineItemEdge.node;
      const currentQuantity = calcLineItem.quantity;
      const calculatedLineItemId = calcLineItem.id;

      // 現在数量が0の場合はエラー
      if (currentQuantity <= 0) {
        throw new Error('このチケットの現在数量が0のため、チェックインできません');
      }

      // 使用枚数が残り枚数を超えていないかチェック
      if (decrementBy > currentQuantity) {
        throw new Error(`残り枚数が足りません（残り${currentQuantity}枚に対して${decrementBy}枚使用しようとしています）`);
      }

      const newQuantity = currentQuantity - decrementBy;

      console.log(`Product: ${productName}, Current quantity: ${currentQuantity}, new quantity: ${newQuantity}`);

      // Step 3: orderEditSetQuantity - 数量を変更
      const setQuantityQuery = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const setQuantityResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: setQuantityQuery,
          variables: {
            id: calculatedOrder.id,
            lineItemId: calculatedLineItemId,
            quantity: newQuantity
          }
        })
      });

      if (setQuantityResponse.errors) {
        throw new Error(`GraphQL error: ${setQuantityResponse.errors.map(e => e.message).join(', ')}`);
      }

      const setQuantityResult = setQuantityResponse.data?.orderEditSetQuantity;
      if (setQuantityResult?.userErrors?.length > 0) {
        throw new Error(`Set quantity error: ${setQuantityResult.userErrors.map(e => e.message).join(', ')}`);
      }

      // Step 4: orderEditCommit - 変更をコミット
      const commitQuery = `
        mutation orderEditCommit($id: ID!) {
          orderEditCommit(id: $id, notifyCustomer: false) {
            order {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const commitResponse = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: commitQuery,
          variables: { id: calculatedOrder.id }
        })
      });

      if (commitResponse.errors) {
        throw new Error(`GraphQL error: ${commitResponse.errors.map(e => e.message).join(', ')}`);
      }

      const commitResult = commitResponse.data?.orderEditCommit;
      if (commitResult?.userErrors?.length > 0) {
        throw new Error(`Commit error: ${commitResult.userErrors.map(e => e.message).join(', ')}`);
      }

      const orderName = commitResult?.order?.name || order.name || `#${orderId}`;

      console.log(`Checkin successful: ${orderName} - ${productName} (${currentQuantity} -> ${newQuantity})`);

      return {
        orderName,
        productName,
        variantTitle,
        previousQuantity: currentQuantity,
        newQuantity
      };

    } catch (error) {
      console.error('Error in checkinLineItem:', error);
      throw error;
    }
  }


  /**
   * LineItemの情報を取得（デクリメントなし）
   * @param {string} orderId 
   * @param {string} lineItemId 
   * @returns {Promise<{orderName: string, productName: string, variantTitle: string, currentQuantity: number}>}
   */
  async getLineItemInfo(orderId, lineItemId) {
    try {
      // GID形式に変換
      const orderGid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;
      const lineItemGid = lineItemId.startsWith('gid://') ? lineItemId : `gid://shopify/LineItem/${lineItemId}`;

      console.log(`Getting LineItem info for order: ${orderGid}, lineItem: ${lineItemGid}`);

      // 注文情報を取得（currentQuantity = 編集後の現在数量）
      const query = `
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            name
            lineItems(first: 100) {
              edges {
                node {
                  id
                  quantity
                  currentQuantity
                  title
                  variantTitle
                }
              }
            }
          }
        }
      `;

      const response = await this.makeRequest('/graphql.json', {
        method: 'POST',
        body: JSON.stringify({
          query: query,
          variables: { id: orderGid }
        })
      });

      if (response.errors) {
        throw new Error(`GraphQL error: ${response.errors.map(e => e.message).join(', ')}`);
      }

      const order = response.data?.order;
      if (!order) {
        throw new Error('注文が見つかりません');
      }

      // LineItemを探す
      const lineItemEdge = order.lineItems.edges.find(edge => edge.node.id === lineItemGid);
      if (!lineItemEdge) {
        throw new Error(`商品が見つかりません: ${lineItemGid}`);
      }

      const lineItemNode = lineItemEdge.node;

      console.log(`LineItem found: quantity=${lineItemNode.quantity}, currentQuantity=${lineItemNode.currentQuantity}`);

      return {
        orderName: order.name,
        productName: lineItemNode.title || '商品名不明',
        variantTitle: lineItemNode.variantTitle || '',
        currentQuantity: lineItemNode.currentQuantity  // 編集後の現在数量を使用
      };

    } catch (error) {
      console.error('Error in getLineItemInfo:', error);
      throw error;
    }
  }

  /**
   * 観戦チケットタグを持つ注文を取得
   * @param {string} tag - 検索するタグ（デフォルト: "観戦チケット"）
   * @param {number} monthsAgo - 何ヶ月前からの注文を取得するか（デフォルト: 6）
   * @returns {Promise<Array>} 注文リスト
   */
  async getTicketOrders(tag = '観戦チケット', monthsAgo = 6) {
    try {
      // 指定月数前の日付を計算
      const sinceDate = new Date();
      sinceDate.setMonth(sinceDate.getMonth() - monthsAgo);
      const dateStr = sinceDate.toISOString().split('T')[0];

      console.log(`Fetching ticket orders with tag: "${tag}", since: ${dateStr}`);

      // タグと日付でクエリを構築
      const tagQuery = tag.includes(' ') || tag.includes(':') ? `"${tag}"` : tag;
      const searchQuery = `tag:${tagQuery} created_at:>${dateStr}`;

      console.log(`Ticket order search query: ${searchQuery}`);

      const allOrders = [];
      let pageInfo = null;
      let hasNextPage = true;
      let pageCount = 0;

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
                        id
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
                        variant {
                          metafields(first: 10) {
                            edges {
                              node {
                                namespace
                                key
                                value
                              }
                            }
                          }
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

        const variables = {
          query: searchQuery,
          first: 250,
          after: pageInfo
        };

        console.log(`Ticket API call #${pageCount}, fetching up to 250 orders...`);

        const response = await this.makeRequest('/graphql.json', {
          method: 'POST',
          body: JSON.stringify({ query, variables })
        });

        if (response.errors) {
          console.error('Shopify GraphQL errors:', JSON.stringify(response.errors, null, 2));
          throw new Error(`Shopify GraphQL error: ${response.errors.map(e => e.message).join(', ')}`);
        }

        const ordersInBatch = response.data?.orders?.edges?.length || 0;
        console.log(`Ticket API call #${pageCount} received ${ordersInBatch} orders`);

        if (response.data && response.data.orders) {
          const orders = response.data.orders.edges.map(edge => edge.node);
          allOrders.push(...orders);

          const { hasNextPage: hasNext, endCursor } = response.data.orders.pageInfo;
          hasNextPage = hasNext;
          pageInfo = endCursor;

          console.log(`Total ticket orders fetched so far: ${allOrders.length}, hasNextPage: ${hasNextPage}`);
        } else {
          console.log('No orders data in response:', JSON.stringify(response, null, 2));
          hasNextPage = false;
        }
      }

      console.log(`Ticket order fetch completed: ${allOrders.length} orders in ${pageCount} API calls`);
      return allOrders;
    } catch (error) {
      console.error('Error fetching ticket orders:', error);
      throw error;
    }
  }

  /**
   * 注文データをTicketシート形式に変換
   * quantity分の行を生成し、currentQuantity分はis_usable=TRUE、残りはFALSE
   * @param {object} order - Shopify注文データ
   * @returns {Array<object>} Ticketシート行データの配列
   */
  formatOrderForTicketSheet(order) {
    const orderId = order.id.replace('gid://shopify/Order/', '');
    const orderName = order.name || '';
    const createdAt = order.createdAt ? this.formatDateTimeForDb(new Date(order.createdAt)) : '';
    const customerId = order.customer?.id?.replace('gid://shopify/Customer/', '') || '';
    const customerName = order.customer
      ? `${order.customer.lastName || ''} ${order.customer.firstName || ''}`.trim()
      : '';
    const customerEmail = order.customer?.email || '';
    const totalPrice = order.totalPriceSet?.shopMoney?.amount || '';
    const financialStatus = this.translateFinancialStatus(order.displayFinancialStatus);
    const fulfillmentStatus = this.translateFulfillmentStatus(order.displayFulfillmentStatus);
    const orderTags = order.tags || [];

    const lineItems = order.lineItems?.edges || [];
    const rows = [];

    // 各LineItemを処理
    lineItems.forEach(edge => {
      const item = edge.node;
      const lineItemId = item.id ? item.id.replace('gid://shopify/LineItem/', '') : '';
      const price = item.originalUnitPriceSet?.shopMoney?.amount || '';
      const quantity = item.quantity || 0;
      const currentQuantity = item.currentQuantity || 0;

      // variantメタフィールドからcolorを取得
      let color = '';
      const variantMetafields = item.variant?.metafields?.edges || [];
      const colorMetafield = variantMetafields.find(
        mf => mf.node.namespace === 'custom' && mf.node.key === 'color'
      );
      if (colorMetafield) {
        color = colorMetafield.node.value || '';
      }

      // quantity分だけ行を生成
      // currentQuantity分はis_usable=TRUE、残りはis_usable=FALSE
      for (let i = 0; i < quantity; i++) {
        const isValid = i < currentQuantity ? 'TRUE' : 'FALSE';
        rows.push({
          baseData: {
            order_no: orderName,
            order_date: createdAt,
            shopify_id: customerId,
            full_name: customerName,
            email: customerEmail,
            total_price: totalPrice,
            financial_status: financialStatus,
            fulfillment_status: fulfillmentStatus,
            product_name: item.title || '',
            variant: item.variantTitle || '',
            price: price,
            line_item_id: lineItemId,
            item_sub_no: i + 1,           // 枝番（1から開始）
            owner_shopify_id: customerId, // 初期値は購入者のshopify_id
            reserved_seat: '',            // 初期値は空欄
            color: color,                 // variantメタフィールドから取得
            is_usable: isValid
          },
          tags: orderTags
        });
      }
    });

    // LineItemがない場合は1行（タグのみ）
    if (rows.length === 0) {
      rows.push({
        baseData: {
          order_no: orderName,
          order_date: createdAt,
          shopify_id: customerId,
          full_name: customerName,
          email: customerEmail,
          total_price: totalPrice,
          financial_status: financialStatus,
          fulfillment_status: fulfillmentStatus,
          product_name: '',
          variant: '',
          price: '',
          line_item_id: '',
          item_sub_no: 1,
          owner_shopify_id: customerId,
          reserved_seat: '',
          color: '',
          is_usable: 'TRUE'
        },
        tags: orderTags
      });
    }

    return rows;
  }

  /**
   * Webhook署名を検証
   * @param {Buffer} body - リクエストボディ（raw）
   * @param {string} hmac - X-Shopify-Hmac-SHA256ヘッダーの値
   * @returns {boolean} 署名が有効かどうか
   */
  verifyWebhookSignature(body, hmac) {
    if (!hmac) return false;
    
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Webhook] SHOPIFY_WEBHOOK_SECRET is not set');
      return false;
    }

    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
    
    return hash === hmac;
  }

  /**
   * variant IDからメタフィールドを一括取得
   * @param {Array<string|number>} variantIds - variant IDの配列
   * @returns {Promise<Map<string, string>>} variant_id → colorのマップ
   */
  async getVariantMetafields(variantIds) {
    if (!variantIds || variantIds.length === 0) return new Map();

    const query = `
      query getVariantMetafields($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            metafields(first: 10) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
        }
      }
    `;

    const gids = variantIds.map(id => `gid://shopify/ProductVariant/${id}`);
    const response = await this.makeRequest('/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { ids: gids } })
    });

    const colorMap = new Map();
    (response.data?.nodes || []).forEach(node => {
      if (!node) return;
      const variantId = node.id.replace('gid://shopify/ProductVariant/', '');
      const colorMf = (node.metafields?.edges || []).find(
        e => e.node.namespace === 'custom' && e.node.key === 'color'
      );
      colorMap.set(variantId, colorMf?.node?.value || '');
    });

    return colorMap;
  }

  /**
   * Webhook形式の注文データをTicket形式に変換
   * REST API形式（Webhook）からGraphQL形式に近い構造に変換し、
   * 既存のformatOrderForTicketSheet()を再利用
   * @param {Object} order - Webhook経由で受信した注文データ（REST API形式）
   * @returns {Promise<Array>} Ticket形式のデータ配列
   */
  async formatWebhookOrderForTicket(order) {
    // variant_idを収集してメタフィールドを一括取得
    const variantIds = (order.line_items || [])
      .map(item => item.variant_id)
      .filter(id => id);
    const colorMap = await this.getVariantMetafields(variantIds);

    // REST API形式のデータをGraphQL形式に変換
    const graphqlLikeOrder = {
      id: `gid://shopify/Order/${order.id}`,
      name: order.name,
      createdAt: order.created_at,
      customer: order.customer ? {
        id: `gid://shopify/Customer/${order.customer.id}`,
        firstName: order.customer.first_name,
        lastName: order.customer.last_name,
        email: order.customer.email
      } : null,
      totalPriceSet: {
        shopMoney: {
          amount: order.total_price
        }
      },
      displayFinancialStatus: this._mapFinancialStatus(order.financial_status),
      displayFulfillmentStatus: this._mapFulfillmentStatus(order.fulfillment_status),
      tags: order.tags ? order.tags.split(', ') : [],
      lineItems: {
        edges: (order.line_items || []).map(item => ({
          node: {
            id: `gid://shopify/LineItem/${item.id}`,
            title: item.title,
            variantTitle: item.variant_title,
            quantity: item.quantity,
            currentQuantity: item.quantity - (item.fulfillable_quantity !== undefined ? 
              (item.quantity - item.fulfillable_quantity) : 0),
            originalUnitPriceSet: {
              shopMoney: {
                amount: item.price
              }
            },
            variant: {
              metafields: {
                edges: item.variant_id && colorMap.has(String(item.variant_id))
                  ? [{ node: { namespace: 'custom', key: 'color', value: colorMap.get(String(item.variant_id)) } }]
                  : []
              }
            }
          }
        }))
      }
    };

    // 既存のメソッドを使用してTicket形式に変換
    return this.formatOrderForTicketSheet(graphqlLikeOrder);
  }

  /**
   * REST API形式のfinancial_statusをGraphQL形式にマッピング
   * @private
   */
  _mapFinancialStatus(status) {
    const mapping = {
      'pending': 'PENDING',
      'authorized': 'AUTHORIZED',
      'partially_paid': 'PARTIALLY_PAID',
      'paid': 'PAID',
      'partially_refunded': 'PARTIALLY_REFUNDED',
      'refunded': 'REFUNDED',
      'voided': 'VOIDED'
    };
    return mapping[status] || status?.toUpperCase() || 'PENDING';
  }

  /**
   * REST API形式のfulfillment_statusをGraphQL形式にマッピング
   * @private
   */
  _mapFulfillmentStatus(status) {
    const mapping = {
      null: null,
      'fulfilled': 'FULFILLED',
      'partial': 'PARTIALLY_FULFILLED',
      'restocked': 'RESTOCKED'
    };
    return mapping[status] || status?.toUpperCase() || null;
  }
}

module.exports = ShopifyService;
