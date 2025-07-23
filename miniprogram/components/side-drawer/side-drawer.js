// components/side-drawer/side-drawer.js
Component({
  properties: {
    // 控制抽屉显示与隐藏
    show: {
      type: Boolean,
      value: false
    }
  },
  data: {},
  methods: {
    // 关闭抽屉
    closeDrawer() {
      this.setData({ show: false });
    },
    // 防止触摸穿透
    doNothing() {
      return;
    }
  }
});
