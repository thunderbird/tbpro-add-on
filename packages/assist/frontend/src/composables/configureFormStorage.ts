import { shallowRef, onMounted, type Ref, ref } from 'vue';

export function configureFormStorage<T extends object>(options: {
  load: () => Promise<T>;
  save: (data: T) => Promise<void>;
}) {
  const formData = ref({}) as Ref<T>;
  const loading = shallowRef(true);
  const error = shallowRef<Error | null>(null);

  async function loadForm() {
    try {
      loading.value = true;
      const loaded = await options.load();
      formData.value = loaded as T;
    } catch (err) {
      error.value = err as Error;
    } finally {
      loading.value = false;
    }
  }

  async function saveForm() {
    if (!formData.value) return;
    try {
      await options.save(formData.value);
    } catch (err) {
      error.value = err as Error;
    }
  }

  onMounted(loadForm);

  return {
    formData,
    loading,
    error,
    saveForm,
  };
}
