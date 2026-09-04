const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);
    const confirming = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel: { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
    };

    async function goToPayment() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/checkout', { method: 'POST' });
        const { actionUrl, params } = res.data;

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = actionUrl;
        for (const [key, value] of Object.entries(params)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        Notification.show('建立付款失敗', 'error');
        paying.value = false;
      }
    }

    async function confirmPayment() {
      if (!order.value || confirming.value) return;
      confirming.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/confirm-payment', { method: 'POST' });
        order.value = res.data;
        if (order.value.status === 'paid') {
          paymentResult.value = 'success';
        } else if (order.value.status === 'failed') {
          paymentResult.value = 'failed';
        }
      } catch (e) {
        Notification.show('查詢付款狀態失敗', 'error');
      } finally {
        confirming.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
        if (order.value.status === 'pending' && order.value.merchant_trade_no) {
          await confirmPayment();
        }
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying, confirming, paymentResult,
      statusMap, paymentMessages, goToPayment, confirmPayment
    };
  }
}).mount('#app');
