return {
    {
        "echasnovski/mini.pairs",
        event = "VeryLazy",
        config = function()
            require("mini.pairs").setup()
        end,
    },
    {
        "echasnovski/mini.ai",
        event = "VeryLazy",
        config = function()
            require("mini.ai").setup()
        end,
    },
}
