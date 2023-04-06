/*
The code in this file is in the public domain.
*/

export const sleep = async (timeout: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};
